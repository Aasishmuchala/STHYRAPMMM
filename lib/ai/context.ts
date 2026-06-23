import type { SupabaseClient } from "@supabase/supabase-js";
import { inr } from "@/lib/format";

/* eslint-disable @typescript-eslint/no-explicit-any */
type DB = SupabaseClient<any, any, any>;

const short = (s: string) => (s ?? "").replace(/^Sthyra\s+/, "");
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const daysBetween = (a: string, b: string) => Math.round((new Date(a).getTime() - new Date(b).getTime()) / 86400000);

// Builds a compact, RLS-scoped snapshot of the workspace for the AI to reason over.
// Runs under the caller's session, so the AI only ever sees what that person can see.
export async function buildContext(supabase: DB, today: Date): Promise<string> {
  const todayStr = today.toISOString().slice(0, 10);
  const monthStart = new Date(today.getUTCFullYear(), today.getUTCMonth(), 1).toISOString().slice(0, 10);

  const [
    { data: divisions },
    { data: briefs },
    { data: tasks },
    { data: invoices },
    { data: txns },
    { data: docs },
    { data: bom },
    { data: ra },
    { data: clients },
  ] = await Promise.all([
    supabase.from("divisions").select("id,slug,name").order("slug"),
    supabase.from("division_briefs").select("division_id,goals,targets,notes"),
    supabase.from("tasks").select("title,status,priority,due_date,divisions(slug)").is("deleted_at", null).neq("status", "done").order("due_date", { nullsFirst: false }).limit(50),
    supabase.from("invoices").select("number,amount_paise,status,due_on,division_id,divisions(slug)").is("deleted_at", null).in("status", ["sent", "overdue"]).limit(200),
    supabase.from("transactions").select("division_id,direction,amount_paise").is("deleted_at", null).gte("occurred_on", monthStart).limit(3000),
    supabase.from("documents").select("title,doc_type,body_md,divisions(slug)").is("deleted_at", null).eq("status", "active").order("updated_at", { ascending: false }).limit(6),
    supabase.from("bom_items").select("qty,unit_cost_paise,division_id").is("deleted_at", null).limit(2000),
    supabase.from("ra_bills").select("sequence,net_paise,gross_paise,deduction_paise,status,certified_on,division_id").is("deleted_at", null).limit(500),
    supabase.from("clients").select("name,stage,value_paise,contact_name,division_id").is("deleted_at", null).limit(500),
  ]);

  const divs = (divisions ?? []) as { id: string; slug: string; name: string }[];
  const slugOf = new Map(divs.map((d) => [d.id, d.slug]));
  const nameOf = new Map(divs.map((d) => [d.id, short(d.name)]));
  const L: string[] = [];

  L.push(`TODAY: ${todayStr}`);
  L.push(`DIVISIONS: ${divs.map((d) => `${short(d.name)} (${d.slug})`).join(", ") || "none visible"}`);

  // ---- Finance (only populated for users with finance access; RLS empties it otherwise) ----
  const tx = (txns ?? []) as { division_id: string; direction: string; amount_paise: number }[];
  const iv = (invoices ?? []) as { number: string; amount_paise: number; status: string; due_on: string | null; division_id: string }[];
  const hasFinance = tx.length > 0 || iv.length > 0;

  if (hasFinance) {
    const cashIn = sum(tx.filter((t) => t.direction === "in").map((t) => t.amount_paise));
    const cashOut = sum(tx.filter((t) => t.direction === "out").map((t) => t.amount_paise));
    L.push(`\nCASH FLOW (this month): in ${inr(cashIn)} · out ${inr(cashOut)} · net ${inr(cashIn - cashOut)}`);

    // Receivables + aging
    const owed = sum(iv.map((i) => i.amount_paise));
    let b0 = 0, b30 = 0, b60 = 0, b90 = 0;
    for (const i of iv) {
      const od = i.due_on ? daysBetween(todayStr, i.due_on) : 0;
      if (od <= 0) b0 += i.amount_paise;
      else if (od <= 30) b30 += i.amount_paise;
      else if (od <= 60) b60 += i.amount_paise;
      else b90 += i.amount_paise;
    }
    L.push(`RECEIVABLES: ${inr(owed)} owed across ${iv.length} invoice(s) — not-yet-due ${inr(b0)}, 1–30d late ${inr(b30)}, 31–60d ${inr(b60)}, 60d+ ${inr(b90)}`);

    const overdue = iv
      .filter((i) => i.status === "overdue" || (i.due_on && daysBetween(todayStr, i.due_on) > 0))
      .map((i) => ({ ...i, days: i.due_on ? daysBetween(todayStr, i.due_on) : 0 }))
      .sort((a, b) => b.amount_paise - a.amount_paise)
      .slice(0, 8);
    if (overdue.length) {
      L.push(`TOP OVERDUE:`);
      for (const i of overdue) L.push(`- ${i.number} (${slugOf.get(i.division_id) ?? "?"}) ${inr(i.amount_paise)}${i.days > 0 ? ` — ${i.days} days late` : ""}`);
    }

    // Per-division revenue/expense/margin this month
    const rev = new Map<string, number>(), exp = new Map<string, number>();
    for (const t of tx) {
      const m = t.direction === "in" ? rev : exp;
      m.set(t.division_id, (m.get(t.division_id) ?? 0) + t.amount_paise);
    }
    const perDiv = divs.filter((d) => (rev.get(d.id) ?? 0) + (exp.get(d.id) ?? 0) > 0);
    if (perDiv.length) {
      L.push(`PER-DIVISION (this month):`);
      for (const d of perDiv) {
        const r = rev.get(d.id) ?? 0, e = exp.get(d.id) ?? 0;
        const m = r > 0 ? Math.round(((r - e) / r) * 100) : 0;
        L.push(`- ${short(d.name)}: rev ${inr(r)} · exp ${inr(e)} · margin ${m}%`);
      }
    }

    // Construction RA bills pending certification
    const raRows = (ra ?? []) as { net_paise: number | null; gross_paise: number; deduction_paise: number; certified_on: string | null; division_id: string }[];
    const raPending = raRows.filter((r) => !r.certified_on);
    if (raPending.length) {
      const net = sum(raPending.map((r) => r.net_paise ?? r.gross_paise - r.deduction_paise));
      L.push(`CONSTRUCTION: ${raPending.length} RA bill(s) pending certification, net ${inr(net)}`);
    }

    // Living Twin / committed BOM per division
    const bomRows = (bom ?? []) as { qty: number; unit_cost_paise: number; division_id: string }[];
    const bomByDiv = new Map<string, number>();
    for (const b of bomRows) bomByDiv.set(b.division_id, (bomByDiv.get(b.division_id) ?? 0) + b.qty * b.unit_cost_paise);
    for (const [divId, total] of bomByDiv) if (total > 0) L.push(`BOM committed — ${nameOf.get(divId) ?? "?"}: ${inr(total)}`);
  }

  // ---- Clients / pipeline ----
  const cl = (clients ?? []) as { name: string; stage: string; value_paise: number; contact_name: string | null; division_id: string }[];
  if (cl.length) {
    const open = cl.filter((c) => ["lead", "contacted", "proposal"].includes(c.stage));
    const won = cl.filter((c) => c.stage === "won");
    const lost = cl.filter((c) => c.stage === "lost").length;
    const byStage = (s: string) => cl.filter((c) => c.stage === s).length;
    L.push(`\nPIPELINE: ${cl.length} clients/leads — open value ${inr(sum(open.map((c) => c.value_paise)))} (${open.length} open: ${byStage("lead")} lead / ${byStage("contacted")} contacted / ${byStage("proposal")} proposal), won ${won.length}, lost ${lost}`);
    const topOpen = open.slice().sort((a, b) => b.value_paise - a.value_paise).slice(0, 6);
    if (topOpen.length) {
      L.push(`TOP OPEN DEALS:`);
      for (const c of topOpen) L.push(`- ${c.name} (${nameOf.get(c.division_id) ?? "?"}) ${inr(c.value_paise)} — ${c.stage}${c.contact_name ? `, ${c.contact_name}` : ""}`);
    }
  }

  // ---- Operating briefs (goals / targets the AI measures against) ----
  const brf = (briefs ?? []) as { division_id: string; goals: string | null; targets: string | null; notes: string | null }[];
  const filled = brf.filter((b) => (b.goals || b.targets || b.notes));
  if (filled.length) {
    L.push(`\nOPERATING BRIEFS (what "good" looks like per division):`);
    for (const b of filled) {
      const parts = [b.goals && `Goals: ${b.goals}`, b.targets && `Targets: ${b.targets}`, b.notes && `Notes: ${b.notes}`].filter(Boolean);
      L.push(`- ${nameOf.get(b.division_id) ?? "?"} — ${parts.join(" | ")}`);
    }
  }

  // ---- Tasks ----
  const ts = (tasks ?? []) as any[];
  L.push(`\nOPEN TASKS (${ts.length}):`);
  for (const t of ts) L.push(`- [${t.priority}] ${t.title} — ${t.divisions?.slug ?? "?"}${t.due_date ? `, due ${t.due_date}` : ""}, ${t.status}`);
  if (ts.length === 0) L.push("- (none)");

  // ---- Documents (titles + an excerpt of the body so it can reason over content) ----
  const dc = (docs ?? []) as any[];
  L.push(`\nDOCUMENTS (${dc.length} most recent):`);
  for (const d of dc) {
    const body = (d.body_md ?? "").replace(/\s+/g, " ").trim().slice(0, 320);
    L.push(`- ${d.title}${d.doc_type ? ` (${d.doc_type})` : ""} — ${d.divisions?.slug ?? "?"}${body ? `: ${body}${body.length >= 320 ? "…" : ""}` : ""}`);
  }
  if (dc.length === 0) L.push("- (none)");

  return L.join("\n");
}
