import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AppShell } from "@/components/shell/AppShell";
import { FinancesView } from "@/components/finances/FinancesView";
import { buildWorkspaceAccess } from "@/lib/access";
import { resolveActiveCompany, isInScope } from "@/lib/activeCompany";
import {
  getWorkspaceContext,
  loadShellUserSummaryCached,
  readActiveCompanySlugCached,
} from "@/lib/workspaceContext";
import { initials } from "@/lib/format";
import type { DivisionOpt, ProjectOpt } from "@/lib/tasks-types";
import type { Txn, Inv, Bom, Ra, EmployeeOption, RecurringPayment, FinanceImportBatch } from "@/lib/finances-types";

type Div = { name: string; slug: string } | null;

export default async function FinancesPage({ searchParams }: { searchParams: Promise<{ div?: string; new?: string }> }) {
  const sp = await searchParams;
  const ctx = await getWorkspaceContext();
  if (!ctx) redirect("/login");
  const supabase = ctx.supabase;
  const user = ctx.user;
  const profile = ctx.profile;

  const access = buildWorkspaceAccess(profile?.global_role, ctx.memberships);
  if (!access.canSeeFinances) redirect("/");

  // Full list of finance-accessible companies (feeds the switcher + view). The
  // data below is then scoped to the single active company (owners may pick
  // "all"), so the ledger shows one company at a time instead of every division.
  const divs: DivisionOpt[] = ctx.divisions
    .map((d: DivisionOpt) => ({ id: d.id, slug: d.slug, name: d.name }))
    .filter((division) => access.isSuperAdmin || access.financeDivisionIds.has(division.id));
  const activeCompany = resolveActiveCompany(await readActiveCompanySlugCached(), divs, access.isSuperAdmin);
  const inScope = (divisionId: string) => isInScope(activeCompany, divisionId);
  const scopedDivs: DivisionOpt[] = divs.filter((d) => inScope(d.id));
  // Push the scope to SQL when possible — owners with "all companies" skip
  // the .in() filter (empty array means "everything RLS already allows").
  const scopeIds = activeCompany.unscoped ? null : activeCompany.scopeDivisionIds;

  const [
    { data: projectRows },
    { data: txnRows }, { data: invRows }, { data: bomRows }, { data: raRows },
    { data: recurringRows }, { data: employeeRows }, { data: importBatches },
  ] = await Promise.all([
    supabase.from("projects").select("id,name,division_id").is("deleted_at", null).eq("status", "active"),
    supabase.from("transactions").select("id,division_id,kind,direction,amount_paise,category,status,occurred_on,counterparty,divisions(name,slug),projects(name)").is("deleted_at", null).order("occurred_on", { ascending: false }).limit(2000).returns<(Omit<Txn, "division_name" | "division_slug" | "project_name"> & { divisions: Div; projects: { name: string } | null })[]>(),
    supabase.from("invoices").select("id,division_id,number,counterparty,amount_paise,status,issued_on,due_on,paid_on,divisions(name,slug)").is("deleted_at", null).order("issued_on", { ascending: false }).limit(2000).returns<(Omit<Inv, "division_name" | "division_slug"> & { divisions: Div })[]>(),
    bomSelect(supabase, scopeIds),
    raSelect(supabase, scopeIds),
    recurringSelect(supabase, scopeIds),
    supabase.from("profiles").select("id,full_name,email,is_active").eq("is_active", true).order("full_name").returns<EmployeeOption[]>(),
    supabase.from("finance_import_batches").select("id,file_name,row_count,imported_rows,status,error_summary,created_at").order("created_at", { ascending: false }).limit(8).returns<FinanceImportBatch[]>(),
  ]);

  const dname = (d: Div) => d?.name ?? "";
  const dslug = (d: Div) => d?.slug ?? "";

  const transactions: Txn[] = (txnRows ?? [])
    .map((t) => ({ ...t, division_name: dname(t.divisions), division_slug: dslug(t.divisions), project_name: t.projects?.name ?? null }));
  const invoices: Inv[] = (invRows ?? [])
    .map((i) => ({ ...i, division_name: dname(i.divisions), division_slug: dslug(i.divisions) }));
  const bom: Bom[] = (bomRows ?? [])
    .map((b) => ({ ...b, division_name: dname(b.divisions), division_slug: dslug(b.divisions) }));
  const ra: Ra[] = (raRows ?? [])
    .map((r) => ({ ...r, division_name: dname(r.divisions), division_slug: dslug(r.divisions), project_name: r.projects?.name ?? null }));

  const projects: ProjectOpt[] = (projectRows ?? [])
    .map((p: ProjectOpt) => ({ id: p.id, name: p.name, division_id: p.division_id }));
  const divisionMap = new Map(divs.map((division) => [division.id, division]));
  const projectMap = new Map(projects.map((project) => [project.id, project]));
  const employeeMap = new Map((employeeRows ?? []).map((employee) => [employee.id, employee]));
  const recurring: RecurringPayment[] = (recurringRows ?? []).map((row) => {
    const division = divisionMap.get(row.division_id);
    const project = row.project_id ? projectMap.get(row.project_id) : null;
    const employee = row.profile_id ? employeeMap.get(row.profile_id) : null;
    return {
      ...row,
      division_name: division?.name ?? "",
      division_slug: division?.slug ?? "",
      project_name: project?.name ?? null,
      profile_name: employee?.full_name ?? null,
      profile_email: employee?.email ?? null,
    };
  });
  const shellUser = await loadShellUserSummaryCached({
    profile,
    memberships: ctx.memberships,
    accessibleDivisions: divs,
    canPickAll: access.isSuperAdmin,
  });

  return (
    <AppShell divisions={divs.map((d) => ({ slug: d.slug, name: d.name.replace(/^Sthyra\s+/, "") }))} canSeeFinances={access.canSeeFinances} canSeePeople={access.canSeePeople} isOwner={access.isSuperAdmin} initials={initials(profile?.full_name ?? null, profile?.email ?? null)} userName={shellUser.userName} userRoleLabel={shellUser.userRoleLabel}>
      <main id="main" className="finance-page" data-testid="main">
          <header className="subhead">
            <div>
              <div className="label" style={{ marginBottom: 9 }}>Finances</div>
              <h1>Ledger &amp; P&amp;L</h1>
              <p className="head-sub">Money in and out, invoices, and profit by division. Use Export to download a spreadsheet.</p>
            </div>
          </header>
          <FinancesView
            transactions={transactions}
            invoices={invoices}
            bom={bom}
            ra={ra}
            recurring={recurring}
            employees={employeeRows ?? []}
            importBatches={importBatches ?? []}
            divisions={scopedDivs}
            projects={projects}
            initialDivision={scopedDivs.find((d) => d.slug === sp.div)?.slug}
            openNew={sp.new === "1"}
          />
        </main>
    </AppShell>
  );
}

// Per-query helpers so the .in() filter and .limit() cap are applied at SQL
// instead of pulling the full table and filtering in JS. Each query already
// had `.is("deleted_at", null)`; we keep that and add the division scope +
// 2000 cap that the audit flagged.
function bomSelect(supabase: SupabaseClient<any, any, any>, scopeIds: string[] | null) {
  let q = supabase.from("bom_items").select("id,division_id,item,qty,unit,unit_cost_paise,category,vendor,divisions(name,slug)").is("deleted_at", null).order("created_at", { ascending: true }).limit(2000);
  if (scopeIds) q = q.in("division_id", scopeIds);
  return q.returns<(Omit<Bom, "division_name" | "division_slug"> & { divisions: Div })[]>();
}

function raSelect(supabase: SupabaseClient<any, any, any>, scopeIds: string[] | null) {
  let q = supabase.from("ra_bills").select("id,division_id,sequence,period,gross_paise,deduction_paise,net_paise,status,certified_on,divisions(name,slug),projects(name)").is("deleted_at", null).order("sequence", { ascending: true }).limit(2000);
  if (scopeIds) q = q.in("division_id", scopeIds);
  return q.returns<(Omit<Ra, "division_name" | "division_slug" | "project_name"> & { divisions: Div; projects: { name: string } | null })[]>();
}

function recurringSelect(supabase: SupabaseClient<any, any, any>, scopeIds: string[] | null) {
  let q = supabase.from("recurring_payments").select("id,division_id,project_id,profile_id,kind,cadence,label,vendor,amount_paise,starts_on,ends_on,status,notes,created_at").is("deleted_at", null).order("kind").order("starts_on", { ascending: false }).limit(2000);
  if (scopeIds) q = q.in("division_id", scopeIds);
  return q.returns<(Omit<RecurringPayment, "division_name" | "division_slug" | "project_name" | "profile_name" | "profile_email">)[]>();
}
