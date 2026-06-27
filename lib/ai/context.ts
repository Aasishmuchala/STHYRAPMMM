import type { SupabaseClient } from "@supabase/supabase-js";
import { inr } from "@/lib/format";

import type { LooseSupabase as DB } from "@/lib/supabase/loose-client";

const short = (s: string) => (s ?? "").replace(/^Sthyra\s+/, "");
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const daysBetween = (a: string, b: string) => Math.round((new Date(a).getTime() - new Date(b).getTime()) / 86400000);

// Hard caps to keep the prompt within the model's context window. These were
// previously set so high (3000 transactions, 2000 BOM lines) that a busy
// workspace blew past the input budget. Tuned for ~8K-token prompts.
const CAP = {
  tasks: 50,
  invoices: 200,
  txns: 500, // was 3000 — now aggregated after fetch
  bom: 500, // was 2000 — aggregated per division
  ra: 200,
  clients: 200,
  docs: 6,
} as const;

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
    supabase.from("tasks").select("title,status:workflow_stage_id,priority,due_date,divisions(slug),stage:workflow_stages!tasks_workflow_stage_id_fkey(is_done)").is("deleted_at", null).order("due_date", { nullsFirst: false }).limit(CAP.tasks),
    supabase.from("invoices").select("number,amount_paise,status,due_on,division_id,divisions(slug)").is("deleted_at", null).in("status", ["sent", "overdue"]).limit(CAP.invoices),
    supabase.from("transactions").select("division_id,direction,amount_paise,occurred_on").is("deleted_at", null).gte("occurred_on", monthStart).limit(CAP.txns),
    supabase.from("documents").select("title,doc_type,body_md,divisions(slug)").is("deleted_at", null).eq("status", "active").order("updated_at", { ascending: false }).limit(CAP.docs),
    supabase.from("bom_items").select("qty,unit_cost_paise,division_id").is("deleted_at", null).limit(CAP.bom),
    supabase.from("ra_bills").select("sequence,net_paise,gross_paise,deduction_paise,status,certified_on,division_id").is("deleted_at", null).limit(CAP.ra),
    supabase.from("clients").select("name,stage,value_paise,contact_name,division_id").is("deleted_at", null).limit(CAP.clients),
  ]);

  const divs = (divisions ?? []) as { id: string; slug: string; name: string }[];
  const slugOf = new Map(divs.map((d) => [d.id, d.slug]));
  const nameOf = new Map(divs.map((d) => [d.id, short(d.name)]));
  const lines: string[] = [];

  lines.push(`TODAY: ${todayStr}`);
  lines.push(`DIVISIONS: ${divs.map((d) => `${short(d.name)} (${d.slug})`).join(", ") || "none visible"}`);

  const tx = (txns ?? []) as { division_id: string; direction: string; amount_paise: number }[];
  const iv = (invoices ?? []) as { number: string; amount_paise: number; status: string; due_on: string | null; division_id: string }[];
  const hasFinance = tx.length > 0 || iv.length > 0;

  if (hasFinance) {
    const cashIn = sum(tx.filter((t) => t.direction === "in").map((t) => t.amount_paise));
    const cashOut = sum(tx.filter((t) => t.direction === "out").map((t) => t.amount_paise));
    lines.push(`\nCASH FLOW (this month, RLS-scoped): in ${inr(cashIn)} | out ${inr(cashOut)} | net ${inr(cashIn - cashOut)}${tx.length === CAP.txns ? ` (cap reached)` : ""}`);

    const owed = sum(iv.map((i) => i.amount_paise));
    let b0 = 0;
    let b30 = 0;
    let b60 = 0;
    let b90 = 0;
    for (const invoice of iv) {
      const overdueDays = invoice.due_on ? daysBetween(todayStr, invoice.due_on) : 0;
      if (overdueDays <= 0) b0 += invoice.amount_paise;
      else if (overdueDays <= 30) b30 += invoice.amount_paise;
      else if (overdueDays <= 60) b60 += invoice.amount_paise;
      else b90 += invoice.amount_paise;
    }
    lines.push(`RECEIVABLES: ${inr(owed)} owed across ${iv.length} invoice(s) - not-yet-due ${inr(b0)}, 1-30d late ${inr(b30)}, 31-60d ${inr(b60)}, 60d+ ${inr(b90)}`);

    const overdue = iv
      .filter((invoice) => invoice.status === "overdue" || (invoice.due_on && daysBetween(todayStr, invoice.due_on) > 0))
      .map((invoice) => ({ ...invoice, days: invoice.due_on ? daysBetween(todayStr, invoice.due_on) : 0 }))
      .sort((a, b) => b.amount_paise - a.amount_paise)
      .slice(0, 8);
    if (overdue.length) {
      lines.push("TOP OVERDUE:");
      for (const invoice of overdue) lines.push(`- ${invoice.number} (${slugOf.get(invoice.division_id) ?? "?"}) ${inr(invoice.amount_paise)}${invoice.days > 0 ? ` - ${invoice.days} days late` : ""}`);
    }

    const revenue = new Map<string, number>();
    const expense = new Map<string, number>();
    for (const txn of tx) {
      const bucket = txn.direction === "in" ? revenue : expense;
      bucket.set(txn.division_id, (bucket.get(txn.division_id) ?? 0) + txn.amount_paise);
    }
    const perDivision = divs.filter((division) => (revenue.get(division.id) ?? 0) + (expense.get(division.id) ?? 0) > 0);
    if (perDivision.length) {
      lines.push("PER-DIVISION (this month):");
      for (const division of perDivision) {
        const rev = revenue.get(division.id) ?? 0;
        const exp = expense.get(division.id) ?? 0;
        const margin = rev > 0 ? Math.round(((rev - exp) / rev) * 100) : 0;
        lines.push(`- ${short(division.name)}: rev ${inr(rev)} | exp ${inr(exp)} | margin ${margin}%`);
      }
    }

    const raRows = (ra ?? []) as { net_paise: number | null; gross_paise: number; deduction_paise: number; certified_on: string | null; division_id: string }[];
    const raPending = raRows.filter((row) => !row.certified_on);
    if (raPending.length) {
      const net = sum(raPending.map((row) => row.net_paise ?? row.gross_paise - row.deduction_paise));
      lines.push(`CONSTRUCTION: ${raPending.length} RA bill(s) pending certification, net ${inr(net)}`);
    }

    // BOM was previously per-row (up to 2000); now aggregated per division.
    const bomRows = (bom ?? []) as { qty: number; unit_cost_paise: number; division_id: string }[];
    const bomByDiv = new Map<string, number>();
    for (const row of bomRows) bomByDiv.set(row.division_id, (bomByDiv.get(row.division_id) ?? 0) + row.qty * row.unit_cost_paise);
    for (const [divId, total] of bomByDiv) if (total > 0) lines.push(`BOM committed - ${nameOf.get(divId) ?? "?"}: ${inr(total)}${bomRows.length === CAP.bom ? ` (cap reached, approximate)` : ""}`);
  }

  const cl = (clients ?? []) as { name: string; stage: string; value_paise: number; contact_name: string | null; division_id: string }[];
  if (cl.length) {
    const open = cl.filter((client) => ["lead", "contacted", "proposal"].includes(client.stage));
    const won = cl.filter((client) => client.stage === "won");
    const lost = cl.filter((client) => client.stage === "lost").length;
    const byStage = (stage: string) => cl.filter((client) => client.stage === stage).length;
    lines.push(`\nPIPELINE: ${cl.length} clients/leads - open value ${inr(sum(open.map((client) => client.value_paise)))} (${open.length} open: ${byStage("lead")} lead / ${byStage("contacted")} contacted / ${byStage("proposal")} proposal), won ${won.length}, lost ${lost}`);
    const topOpen = open.slice().sort((a, b) => b.value_paise - a.value_paise).slice(0, 6);
    if (topOpen.length) {
      lines.push("TOP OPEN DEALS:");
      for (const client of topOpen) lines.push(`- ${client.name} (${nameOf.get(client.division_id) ?? "?"}) ${inr(client.value_paise)} - ${client.stage}${client.contact_name ? `, ${client.contact_name}` : ""}`);
    }
  }

  const briefsFilled = (briefs ?? []) as { division_id: string; goals: string | null; targets: string | null; notes: string | null }[];
  const filled = briefsFilled.filter((brief) => brief.goals || brief.targets || brief.notes);
  if (filled.length) {
    lines.push(`\nOPERATING BRIEFS (what "good" looks like per division):`);
    for (const brief of filled) {
      const parts = [brief.goals && `Goals: ${brief.goals}`, brief.targets && `Targets: ${brief.targets}`, brief.notes && `Notes: ${brief.notes}`].filter(Boolean);
      lines.push(`- ${nameOf.get(brief.division_id) ?? "?"} - ${parts.join(" | ")}`);
    }
  }

  const openTasks = ((tasks ?? []) as {
    title: string;
    status: string;
    priority: string;
    due_date: string | null;
    divisions: { slug: string } | { slug: string }[] | null;
    stage: { is_done: boolean } | { is_done: boolean }[] | null;
  }[]).filter((task) => {
    const stage = Array.isArray(task.stage) ? task.stage[0] : task.stage;
    return !stage?.is_done;
  });
  lines.push(`\nOPEN TASKS (${openTasks.length}):`);
  for (const task of openTasks) {
    const division = Array.isArray(task.divisions) ? task.divisions[0] : task.divisions;
    lines.push(`- [${task.priority}] ${task.title} - ${division?.slug ?? "?"}${task.due_date ? `, due ${task.due_date}` : ""}, ${task.status}`);
  }
  if (openTasks.length === 0) lines.push("- (none)");

  const recentDocs = (docs ?? []) as { title: string; doc_type: string | null; body_md: string | null; divisions: { slug: string } | { slug: string }[] | null }[];
  lines.push(`\nDOCUMENTS (${recentDocs.length} most recent):`);
  for (const doc of recentDocs) {
    const division = Array.isArray(doc.divisions) ? doc.divisions[0] : doc.divisions;
    // Truncate + strip markdown noise; cap to 200 chars to keep prompt lean.
    const body = (doc.body_md ?? "")
      .replace(/[#*_`>]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 200);
    lines.push(`- ${doc.title}${doc.doc_type ? ` (${doc.doc_type})` : ""} - ${division?.slug ?? "?"}${body ? `: ${body}${body.length >= 200 ? "..." : ""}` : ""}`);
  }
  if (recentDocs.length === 0) lines.push("- (none)");

  return lines.join("\n");
}
