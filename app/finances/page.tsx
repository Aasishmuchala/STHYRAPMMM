import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/shell/AppShell";
import { FinancesView } from "@/components/finances/FinancesView";
import { initials } from "@/lib/format";
import type { DivisionOpt, ProjectOpt } from "@/lib/tasks-types";
import type { Txn, Inv, Bom, Ra } from "@/lib/finances-types";

type Div = { name: string; slug: string } | null;

export default async function FinancesPage({ searchParams }: { searchParams: Promise<{ div?: string; new?: string }> }) {
  const sp = await searchParams;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as unknown as SupabaseClient<any, any, any>;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: memberships }] = await Promise.all([
    supabase.from("profiles").select("full_name,email,global_role").eq("id", user.id).maybeSingle(),
    supabase.from("division_members").select("role").eq("user_id", user.id),
  ]);
  const isOwner = profile?.global_role === "owner";
  const canSeeFinances = isOwner || (memberships ?? []).some((m: { role: string }) => m.role === "lead");
  if (!canSeeFinances) redirect("/");

  const [
    { data: divisions }, { data: projectRows },
    { data: txnRows }, { data: invRows }, { data: bomRows }, { data: raRows },
  ] = await Promise.all([
    supabase.from("divisions").select("id,slug,name").order("slug"),
    supabase.from("projects").select("id,name,division_id").is("deleted_at", null).eq("status", "active"),
    supabase.from("transactions").select("id,division_id,kind,direction,amount_paise,category,status,occurred_on,counterparty,divisions(name,slug),projects(name)").is("deleted_at", null).order("occurred_on", { ascending: false }).limit(2000).returns<(Omit<Txn, "division_name" | "division_slug" | "project_name"> & { divisions: Div; projects: { name: string } | null })[]>(),
    supabase.from("invoices").select("id,division_id,number,counterparty,amount_paise,status,issued_on,due_on,paid_on,divisions(name,slug)").is("deleted_at", null).order("issued_on", { ascending: false }).limit(2000).returns<(Omit<Inv, "division_name" | "division_slug"> & { divisions: Div })[]>(),
    supabase.from("bom_items").select("id,division_id,item,qty,unit,unit_cost_paise,category,vendor,divisions(name,slug)").is("deleted_at", null).order("created_at", { ascending: true }).returns<(Omit<Bom, "division_name" | "division_slug"> & { divisions: Div })[]>(),
    supabase.from("ra_bills").select("id,division_id,sequence,period,gross_paise,deduction_paise,net_paise,status,certified_on,divisions(name,slug),projects(name)").is("deleted_at", null).order("sequence", { ascending: true }).returns<(Omit<Ra, "division_name" | "division_slug" | "project_name"> & { divisions: Div; projects: { name: string } | null })[]>(),
  ]);

  const dname = (d: Div) => d?.name ?? "";
  const dslug = (d: Div) => d?.slug ?? "";

  const transactions: Txn[] = (txnRows ?? []).map((t) => ({ ...t, division_name: dname(t.divisions), division_slug: dslug(t.divisions), project_name: t.projects?.name ?? null }));
  const invoices: Inv[] = (invRows ?? []).map((i) => ({ ...i, division_name: dname(i.divisions), division_slug: dslug(i.divisions) }));
  const bom: Bom[] = (bomRows ?? []).map((b) => ({ ...b, division_name: dname(b.divisions), division_slug: dslug(b.divisions) }));
  const ra: Ra[] = (raRows ?? []).map((r) => ({ ...r, division_name: dname(r.divisions), division_slug: dslug(r.divisions), project_name: r.projects?.name ?? null }));

  const divs: DivisionOpt[] = (divisions ?? []).map((d: DivisionOpt) => ({ id: d.id, slug: d.slug, name: d.name }));
  const projects: ProjectOpt[] = (projectRows ?? []).map((p: ProjectOpt) => ({ id: p.id, name: p.name, division_id: p.division_id }));

  return (
    <AppShell divisions={divs.map((d) => ({ slug: d.slug, name: d.name.replace(/^Sthyra\s+/, "") }))} canSeeFinances={canSeeFinances} isOwner={isOwner} initials={initials(profile?.full_name ?? null, profile?.email ?? null)}>
      <main>
          <header className="subhead">
            <div>
              <div className="label" style={{ marginBottom: 9 }}>Finances</div>
              <h1>Ledger &amp; P&amp;L</h1>
              <p className="head-sub">Money in and out, invoices, and profit by division. Use Export to download a spreadsheet.</p>
            </div>
          </header>
          <FinancesView transactions={transactions} invoices={invoices} bom={bom} ra={ra} divisions={divs} projects={projects} initialDivision={divs.find((d) => d.slug === sp.div)?.slug} openNew={sp.new === "1"} />
        </main>
    </AppShell>
  );
}
