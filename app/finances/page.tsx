import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/shell/AppShell";
import { FinancesView } from "@/components/finances/FinancesView";
import { buildWorkspaceAccess } from "@/lib/access";
import { initials } from "@/lib/format";
import type { DivisionOpt, ProjectOpt } from "@/lib/tasks-types";
import type { Txn, Inv, Bom, Ra, EmployeeOption, RecurringPayment, FinanceImportBatch } from "@/lib/finances-types";

type Div = { name: string; slug: string } | null;

export default async function FinancesPage({ searchParams }: { searchParams: Promise<{ div?: string; new?: string }> }) {
  const sp = await searchParams;
  const supabase = (await createClient()) as unknown as SupabaseClient<any, any, any>;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: memberships }] = await Promise.all([
    supabase.from("profiles").select("full_name,email,global_role").eq("id", user.id).maybeSingle(),
    supabase.from("division_members").select("role,division_id").eq("user_id", user.id),
  ]);
  const membershipRows = (memberships ?? []) as { role: string; division_id: string }[];
  const access = buildWorkspaceAccess(profile?.global_role, membershipRows);
  if (!access.canSeeFinances) redirect("/");

  const [
    { data: divisions }, { data: projectRows },
    { data: txnRows }, { data: invRows }, { data: bomRows }, { data: raRows },
    { data: recurringRows }, { data: employeeRows }, { data: importBatches },
  ] = await Promise.all([
    supabase.from("divisions").select("id,slug,name").order("slug"),
    supabase.from("projects").select("id,name,division_id").is("deleted_at", null).eq("status", "active"),
    supabase.from("transactions").select("id,division_id,kind,direction,amount_paise,category,status,occurred_on,counterparty,divisions(name,slug),projects(name)").is("deleted_at", null).order("occurred_on", { ascending: false }).limit(2000).returns<(Omit<Txn, "division_name" | "division_slug" | "project_name"> & { divisions: Div; projects: { name: string } | null })[]>(),
    supabase.from("invoices").select("id,division_id,number,counterparty,amount_paise,status,issued_on,due_on,paid_on,divisions(name,slug)").is("deleted_at", null).order("issued_on", { ascending: false }).limit(2000).returns<(Omit<Inv, "division_name" | "division_slug"> & { divisions: Div })[]>(),
    supabase.from("bom_items").select("id,division_id,item,qty,unit,unit_cost_paise,category,vendor,divisions(name,slug)").is("deleted_at", null).order("created_at", { ascending: true }).returns<(Omit<Bom, "division_name" | "division_slug"> & { divisions: Div })[]>(),
    supabase.from("ra_bills").select("id,division_id,sequence,period,gross_paise,deduction_paise,net_paise,status,certified_on,divisions(name,slug),projects(name)").is("deleted_at", null).order("sequence", { ascending: true }).returns<(Omit<Ra, "division_name" | "division_slug" | "project_name"> & { divisions: Div; projects: { name: string } | null })[]>(),
    supabase.from("recurring_payments").select("id,division_id,project_id,profile_id,kind,cadence,label,vendor,amount_paise,starts_on,ends_on,status,notes,created_at").is("deleted_at", null).order("kind").order("starts_on", { ascending: false }).returns<(Omit<RecurringPayment, "division_name" | "division_slug" | "project_name" | "profile_name" | "profile_email">)[]>(),
    supabase.from("profiles").select("id,full_name,email,is_active").eq("is_active", true).order("full_name").returns<EmployeeOption[]>(),
    supabase.from("finance_import_batches").select("id,file_name,row_count,imported_rows,status,error_summary,created_at").order("created_at", { ascending: false }).limit(8).returns<FinanceImportBatch[]>(),
  ]);

  const dname = (d: Div) => d?.name ?? "";
  const dslug = (d: Div) => d?.slug ?? "";

  const transactions: Txn[] = (txnRows ?? [])
    .map((t) => ({ ...t, division_name: dname(t.divisions), division_slug: dslug(t.divisions), project_name: t.projects?.name ?? null }))
    .filter((row) => access.isSuperAdmin || access.financeDivisionIds.has(row.division_id));
  const invoices: Inv[] = (invRows ?? [])
    .map((i) => ({ ...i, division_name: dname(i.divisions), division_slug: dslug(i.divisions) }))
    .filter((row) => access.isSuperAdmin || access.financeDivisionIds.has(row.division_id));
  const bom: Bom[] = (bomRows ?? [])
    .map((b) => ({ ...b, division_name: dname(b.divisions), division_slug: dslug(b.divisions) }))
    .filter((row) => access.isSuperAdmin || access.financeDivisionIds.has(row.division_id));
  const ra: Ra[] = (raRows ?? [])
    .map((r) => ({ ...r, division_name: dname(r.divisions), division_slug: dslug(r.divisions), project_name: r.projects?.name ?? null }))
    .filter((row) => access.isSuperAdmin || access.financeDivisionIds.has(row.division_id));

  const divs: DivisionOpt[] = (divisions ?? [])
    .map((d: DivisionOpt) => ({ id: d.id, slug: d.slug, name: d.name }))
    .filter((division) => access.isSuperAdmin || access.financeDivisionIds.has(division.id));
  const projects: ProjectOpt[] = (projectRows ?? [])
    .map((p: ProjectOpt) => ({ id: p.id, name: p.name, division_id: p.division_id }))
    .filter((project) => access.isSuperAdmin || access.financeDivisionIds.has(project.division_id));
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
  }).filter((row) => access.isSuperAdmin || access.financeDivisionIds.has(row.division_id));

  return (
    <AppShell divisions={divs.map((d) => ({ slug: d.slug, name: d.name.replace(/^Sthyra\s+/, "") }))} canSeeFinances={access.canSeeFinances} canSeePeople={access.canSeePeople} isOwner={access.isSuperAdmin} initials={initials(profile?.full_name ?? null, profile?.email ?? null)}>
      <main id="main" data-testid="main">
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
            divisions={divs}
            projects={projects}
            initialDivision={divs.find((d) => d.slug === sp.div)?.slug}
            openNew={sp.new === "1"}
          />
        </main>
    </AppShell>
  );
}
