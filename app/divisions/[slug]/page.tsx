import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/shell/AppShell";
import { initials, inrShort, inr, pct, dueLabel } from "@/lib/format";
import { avatarBg } from "@/lib/avatar";
import { IconDoc } from "@/components/icons";
import { DivisionBriefCard } from "@/components/divisions/DivisionBriefCard";
import type { DivisionOpt } from "@/lib/tasks-types";

const VALID = ["studios", "digital", "construction", "living_twin"];
const prioColor: Record<string, string> = { high: "var(--danger)", med: "var(--warning)", low: "var(--text-faint)" };
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const short = (n: string) => n.replace(/^Sthyra\s+/, "");

type TaskRow = {
  id: string;
  title: string;
  priority: string;
  status: string;
  due_date: string | null;
  assignee_id: string | null;
  projects: { name: string } | null;
  assignee: { full_name: string | null } | null;
  stage: { is_done: boolean } | null;
};
type DocRow = { id: string; title: string; doc_type: string | null; storage_path: string | null; updated_at: string };

export default async function DivisionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!VALID.includes(slug)) notFound();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as unknown as SupabaseClient<any, any, any>;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: division } = await supabase.from("divisions").select("id,slug,name").eq("slug", slug).maybeSingle();
  if (!division) notFound(); // invalid, or RLS hid it (not a member)

  const [{ data: profile }, { data: myMem }, { data: allDivs }] = await Promise.all([
    supabase.from("profiles").select("full_name,email,global_role").eq("id", user.id).maybeSingle(),
    supabase.from("division_members").select("division_id,role"),
    supabase.from("divisions").select("id,slug,name").order("slug"),
  ]);
  const isOwner = profile?.global_role === "owner";
  const myRole: string = isOwner ? "owner" : (myMem ?? []).find((m: { division_id: string }) => m.division_id === division.id)?.role ?? "member";
  const canSeeFinances = isOwner || myRole === "lead";
  const navCanSeeFinances = isOwner || (myMem ?? []).some((m: { role: string }) => m.role === "lead");

  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const noRows = Promise.resolve({ data: [] as unknown[] });

  const [{ data: projects }, { data: tasks }, { data: docs }, { data: txns }, { data: invoices }, { data: bom }, { data: ra }, { data: briefRow }] = await Promise.all([
    supabase.from("projects").select("id,name,client,status").eq("division_id", division.id).is("deleted_at", null).order("created_at"),
    supabase.from("tasks").select("id,title,priority,status:status_key,due_date,assignee_id,projects(name),assignee:profiles!tasks_assignee_id_fkey(full_name),stage:task_stages!tasks_status_key_fkey(is_done)").eq("division_id", division.id).is("deleted_at", null).order("due_date", { nullsFirst: false }).limit(8).returns<TaskRow[]>(),
    supabase.from("documents").select("id,title,doc_type,storage_path,updated_at").eq("division_id", division.id).is("deleted_at", null).eq("status", "active").order("updated_at", { ascending: false }).limit(6).returns<DocRow[]>(),
    supabase.from("transactions").select("direction,amount_paise").eq("division_id", division.id).is("deleted_at", null).gte("occurred_on", monthStart),
    supabase.from("invoices").select("amount_paise,status").eq("division_id", division.id).is("deleted_at", null),
    slug === "living_twin" ? supabase.from("bom_items").select("qty,unit_cost_paise").eq("division_id", division.id).is("deleted_at", null) : noRows,
    slug === "construction" ? supabase.from("ra_bills").select("sequence,period,net_paise,gross_paise,deduction_paise,status").eq("division_id", division.id).is("deleted_at", null).order("sequence") : noRows,
    supabase.from("division_briefs").select("goals,targets,notes").eq("division_id", division.id).maybeSingle(),
  ]);

  const proj = (projects ?? []) as { id: string; name: string; client: string | null; status: string }[];
  const tsk = ((tasks ?? []) as TaskRow[]).filter((task) => !task.stage?.is_done);
  const dcs = (docs ?? []) as DocRow[];
  const tx = (txns ?? []) as { direction: string; amount_paise: number }[];
  const inv = (invoices ?? []) as { amount_paise: number; status: string }[];
  const bomItems = (bom ?? []) as { qty: number; unit_cost_paise: number }[];
  const raBills = (ra ?? []) as { sequence: number; period: string | null; net_paise: number | null; gross_paise: number; deduction_paise: number; status: string }[];

  const moneyIn = sum(tx.filter((t) => t.direction === "in").map((t) => t.amount_paise));
  const moneyOut = sum(tx.filter((t) => t.direction === "out").map((t) => t.amount_paise));
  const owed = sum(inv.filter((i) => i.status === "sent" || i.status === "overdue").map((i) => i.amount_paise));
  const overdue = inv.filter((i) => i.status === "overdue").length;
  const margin = moneyIn > 0 ? ((moneyIn - moneyOut) / moneyIn) * 100 : 0;
  const activeProjects = proj.filter((p) => p.status === "active").length;
  const bomTotal = sum(bomItems.map((b) => b.qty * b.unit_cost_paise));

  const divs: DivisionOpt[] = (allDivs ?? []).map((d: DivisionOpt) => ({ id: d.id, slug: d.slug, name: d.name }));
  const canEditBrief = isOwner || myRole === "lead";
  const brief = (briefRow ?? null) as { goals: string | null; targets: string | null; notes: string | null } | null;

  return (
    <AppShell divisions={divs.map((d) => ({ slug: d.slug, name: short(d.name) }))} canSeeFinances={navCanSeeFinances} isOwner={isOwner} initials={initials(profile?.full_name ?? null, profile?.email ?? null)}>
      <main>
        <header className="subhead">
          <div>
            <div className="label" style={{ marginBottom: 9 }}>Division</div>
            <h1>{short(division.name)} <span className="role-pill" style={{ verticalAlign: "middle", marginLeft: 6 }}>{myRole}</span></h1>
          </div>
        </header>

        {canSeeFinances && (
          <section className="fin" aria-label="Division finances" style={{ marginBottom: 24 }}>
            <div className="cell"><div className="label">Money in · MTD</div><div className="v mono">{inrShort(moneyIn)}</div><div className="d dim">{tx.filter((t) => t.direction === "in").length} entries</div></div>
            <div className="cell"><div className="label">Money out · MTD</div><div className="v mono">{inrShort(moneyOut)}</div><div className="d dim">{tx.filter((t) => t.direction === "out").length} entries</div></div>
            <div className="cell"><div className="label">Owed to us</div><div className="v mono">{inrShort(owed)}</div><div className={`d ${overdue ? "down" : "dim"}`}>{overdue} overdue</div></div>
            <div className="cell"><div className="label">Margin</div><div className="v mono">{pct(margin)}</div><div className="d dim">in − out</div></div>
          </section>
        )}

        <DivisionBriefCard divisionId={division.id} divisionName={short(division.name)} canEdit={canEditBrief} brief={brief} />

        <div className="cols">
          {/* LEFT */}
          <div>
            <div className="section-h"><span className="label">Projects · {activeProjects} active</span></div>
            {proj.length === 0 ? <EmptyRow text="No projects yet." /> : (
              <div className="tasks glass" style={{ marginBottom: 24 }}>
                {proj.map((p) => (
                  <div className="task" key={p.id}>
                    <span className="t">{p.name}{p.client ? <span className="fsub"> · {p.client}</span> : ""}</span>
                    <span className={`spill ${p.status === "active" ? "pending" : p.status === "done" ? "paid" : "draft"}`}>{p.status}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="section-h"><span className="label">Open tasks</span><Link href={`/tasks?div=${slug}`} className="link">Open board →</Link></div>
            {tsk.length === 0 ? <EmptyRow text="No open tasks." /> : (
              <div className="tasks glass">
                {tsk.map((t) => (
                  <div className="task" key={t.id}>
                    <span className="tprio" style={{ background: prioColor[t.priority] }} />
                    <span className="t">{t.title}</span>
                    {t.projects?.name && <span className="chip">{t.projects.name}</span>}
                    {t.assignee?.full_name && <span className="tasg" style={{ background: avatarBg(t.assignee.full_name), width: 22, height: 22 }} title={t.assignee.full_name}>{initials(t.assignee.full_name, null)}</span>}
                    {t.due_date && <span className="due">{dueLabel(t.due_date, today)}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* RIGHT */}
          <div>
            {slug === "living_twin" && canSeeFinances && (
              <>
                <div className="section-h"><span className="label">Bill of materials</span><Link href={`/finances?div=${slug}`} className="link">Open →</Link></div>
                <div className="pnl-card" style={{ marginBottom: 22 }}>
                  <div className="pnl-row"><span className="k">Line items</span><span className="v">{bomItems.length}</span></div>
                  <div className="pnl-line" />
                  <div className="pnl-row"><span className="k">BOM total</span><span className="pnl-margin">{inr(bomTotal)}</span></div>
                </div>
              </>
            )}
            {slug === "construction" && canSeeFinances && (
              <>
                <div className="section-h"><span className="label">RA bills</span><Link href={`/finances?div=${slug}`} className="link">Open →</Link></div>
                {raBills.length === 0 ? <EmptyRow text="No RA bills." /> : (
                  <div className="tasks glass" style={{ marginBottom: 22 }}>
                    {raBills.map((r) => (
                      <div className="task" key={r.sequence}>
                        <span className="t mono">RA #{r.sequence}<span className="fsub"> · {r.period ?? "—"}</span></span>
                        <span className="due mono">{inr(r.net_paise ?? r.gross_paise - r.deduction_paise)}</span>
                        <span className={`spill ${r.status === "certified" ? "paid" : "pending"}`}>{r.status}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            <div className="section-h"><span className="label">Documents</span><Link href={`/documents?div=${slug}`} className="link">Library →</Link></div>
            {dcs.length === 0 ? <EmptyRow text="No documents yet." /> : (
              <div className="tasks glass">
                {dcs.map((d) => (
                  <div className="task" key={d.id}>
                    <span style={{ color: "var(--accent)", display: "grid", placeItems: "center" }}>
                      <IconDoc size={15} />
                    </span>
                    <span className="t">{d.title}</span>
                    {d.doc_type && <span className="chip">{d.doc_type}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </AppShell>
  );
}

function EmptyRow({ text }: { text: string }) {
  return <div className="glass" style={{ borderRadius: 13, padding: "26px 18px", textAlign: "center", color: "var(--text-faint)", fontSize: 12.5 }}>{text}</div>;
}
