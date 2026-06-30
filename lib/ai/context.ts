import { inr } from "@/lib/format";
import type { AiPolicy } from "@/lib/ai/policy";

import type { LooseSupabase as DB } from "@/lib/supabase/loose-client";

const short = (s: string) => (s ?? "").replace(/^Sthyra\s+/, "");
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const daysBetween = (a: string, b: string) => Math.round((new Date(a).getTime() - new Date(b).getTime()) / 86400000);

const CAP = {
  tasks: 50,
  invoices: 200,
  txns: 500,
  bom: 500,
  ra: 200,
  clients: 200,
  docs: 6,
} as const;

type DivisionRow = { id: string; slug: string; name: string };
type BriefRow = { division_id: string; goals: string | null; targets: string | null; notes: string | null };
type TaskRow = {
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
  division_id: string;
  assignee_id: string | null;
  divisions: { slug: string } | { slug: string }[] | null;
  assignee: { full_name: string | null } | { full_name: string | null }[] | null;
  stage: { is_done: boolean } | { is_done: boolean }[] | null;
};
type InvoiceRow = { number: string; amount_paise: number; status: string; due_on: string | null; division_id: string };
type TxnRow = { division_id: string; direction: string; amount_paise: number };
type DocRow = { title: string; doc_type: string | null; body_md: string | null; divisions: { slug: string } | { slug: string }[] | null };
type BomRow = { qty: number; unit_cost_paise: number; division_id: string };
type RaRow = { net_paise: number | null; gross_paise: number; deduction_paise: number; certified_on: string | null; division_id: string };
type ClientRow = { name: string; stage: string; value_paise: number; contact_name: string | null; division_id: string };
type MemberRow = {
  division_id: string;
  role: string;
  user_id: string;
  profiles: { full_name: string | null; email: string | null } | { full_name: string | null; email: string | null }[] | null;
};
type ProfileRoleRow = {
  profile_id: string;
  company_roles: { name: string } | { name: string }[] | null;
};

function scopeLabel(policy: AiPolicy): string {
  if (policy.audience === "owner") return "owner - full workspace scope";
  if (policy.audience === "lead") return "lead - tasks, docs, team only";
  if (policy.audience === "member") return "member - tasks and docs only";
  return "no assistant access";
}

export async function buildContext(supabase: DB, today: Date, policy: AiPolicy): Promise<string> {
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
    { data: members },
    { data: profileRoles },
  ] = await Promise.all([
    supabase.from("divisions").select("id,slug,name").order("slug"),
    policy.canSeeBriefs
      ? supabase.from("division_briefs").select("division_id,goals,targets,notes")
      : Promise.resolve({ data: [] as BriefRow[] }),
    supabase
      .from("tasks")
      .select("title,status:workflow_stage_id,priority,due_date,division_id,assignee_id,divisions(slug),assignee:profiles!tasks_assignee_id_fkey(full_name),stage:workflow_stages!tasks_workflow_stage_id_fkey(is_done)")
      .is("deleted_at", null)
      .order("due_date", { nullsFirst: false })
      .limit(CAP.tasks),
    policy.canSeeFinance
      ? supabase.from("invoices").select("number,amount_paise,status,due_on,division_id,divisions(slug)").is("deleted_at", null).in("status", ["sent", "overdue"]).limit(CAP.invoices)
      : Promise.resolve({ data: [] as InvoiceRow[] }),
    policy.canSeeFinance
      ? supabase.from("transactions").select("division_id,direction,amount_paise,occurred_on").is("deleted_at", null).gte("occurred_on", monthStart).limit(CAP.txns)
      : Promise.resolve({ data: [] as TxnRow[] }),
    supabase.from("documents").select("title,doc_type,body_md,divisions(slug)").is("deleted_at", null).eq("status", "active").order("updated_at", { ascending: false }).limit(CAP.docs),
    policy.canSeeFinance
      ? supabase.from("bom_items").select("qty,unit_cost_paise,division_id").is("deleted_at", null).limit(CAP.bom)
      : Promise.resolve({ data: [] as BomRow[] }),
    policy.canSeeFinance
      ? supabase.from("ra_bills").select("sequence,net_paise,gross_paise,deduction_paise,status,certified_on,division_id").is("deleted_at", null).limit(CAP.ra)
      : Promise.resolve({ data: [] as RaRow[] }),
    policy.canSeePipeline
      ? supabase.from("clients").select("name,stage,value_paise,contact_name,division_id").is("deleted_at", null).limit(CAP.clients)
      : Promise.resolve({ data: [] as ClientRow[] }),
    policy.canSeePeople && policy.manageableDivisionIds.size > 0
      ? supabase
        .from("division_members")
        .select("division_id,role,user_id,profiles!division_members_user_id_fkey(full_name,email)")
        .in("division_id", [...policy.manageableDivisionIds])
      : Promise.resolve({ data: [] as MemberRow[] }),
    policy.canSeePeople
      ? supabase.from("profile_roles").select("profile_id,company_roles(name)")
      : Promise.resolve({ data: [] as ProfileRoleRow[] }),
  ]);

  const divs = (divisions ?? []) as DivisionRow[];
  const slugOf = new Map(divs.map((d) => [d.id, d.slug]));
  const nameOf = new Map(divs.map((d) => [d.id, short(d.name)]));
  const lines: string[] = [];

  lines.push(`TODAY: ${todayStr}`);
  lines.push(`AI SCOPE: ${scopeLabel(policy)}`);
  lines.push(`DIVISIONS: ${divs.map((d) => `${short(d.name)} (${d.slug})`).join(", ") || "none visible"}`);

  const tx = (txns ?? []) as TxnRow[];
  const iv = (invoices ?? []) as InvoiceRow[];
  if (policy.canSeeFinance && (tx.length > 0 || iv.length > 0)) {
    const cashIn = sum(tx.filter((t) => t.direction === "in").map((t) => t.amount_paise));
    const cashOut = sum(tx.filter((t) => t.direction === "out").map((t) => t.amount_paise));
    lines.push(`\nCASH FLOW (this month, RLS-scoped): in ${inr(cashIn)} | out ${inr(cashOut)} | net ${inr(cashIn - cashOut)}${tx.length === CAP.txns ? " (cap reached)" : ""}`);

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

    const raRows = (ra ?? []) as RaRow[];
    const raPending = raRows.filter((row) => !row.certified_on);
    if (raPending.length) {
      const net = sum(raPending.map((row) => row.net_paise ?? row.gross_paise - row.deduction_paise));
      lines.push(`CONSTRUCTION: ${raPending.length} RA bill(s) pending certification, net ${inr(net)}`);
    }

    const bomRows = (bom ?? []) as BomRow[];
    const bomByDiv = new Map<string, number>();
    for (const row of bomRows) bomByDiv.set(row.division_id, (bomByDiv.get(row.division_id) ?? 0) + row.qty * row.unit_cost_paise);
    for (const [divId, total] of bomByDiv) {
      if (total > 0) lines.push(`BOM committed - ${nameOf.get(divId) ?? "?"}: ${inr(total)}${bomRows.length === CAP.bom ? " (cap reached, approximate)" : ""}`);
    }
  }

  const cl = (clients ?? []) as ClientRow[];
  if (policy.canSeePipeline && cl.length) {
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

  const briefsFilled = (briefs ?? []) as BriefRow[];
  const filled = briefsFilled.filter((brief) => brief.goals || brief.targets || brief.notes);
  if (policy.canSeeBriefs && filled.length) {
    lines.push("\nOPERATING BRIEFS:");
    for (const brief of filled) {
      const parts = [
        brief.goals && `Goals: ${brief.goals}`,
        brief.targets && `Targets: ${brief.targets}`,
        brief.notes && `Notes: ${brief.notes}`,
      ].filter(Boolean);
      lines.push(`- ${nameOf.get(brief.division_id) ?? "?"} - ${parts.join(" | ")}`);
    }
  }

  const openTasks = ((tasks ?? []) as TaskRow[]).filter((task) => {
    const stage = Array.isArray(task.stage) ? task.stage[0] : task.stage;
    return !stage?.is_done;
  });
  lines.push(`\nOPEN TASKS (${openTasks.length}):`);
  for (const task of openTasks) {
    const division = Array.isArray(task.divisions) ? task.divisions[0] : task.divisions;
    const assignee = Array.isArray(task.assignee) ? task.assignee[0] : task.assignee;
    const assigneeText = policy.canSeePeople && assignee?.full_name ? `, assignee ${assignee.full_name}` : "";
    lines.push(`- [${task.priority}] ${task.title} - ${division?.slug ?? "?"}${task.due_date ? `, due ${task.due_date}` : ""}${assigneeText}, ${task.status}`);
  }
  if (openTasks.length === 0) lines.push("- (none)");

  if (policy.canSeePeople) {
    const teamRows = (members ?? []) as MemberRow[];

    // Map each person -> their skill roles (crafts) for skill-based assignment.
    const rolesByPerson = new Map<string, string[]>();
    for (const row of (profileRoles ?? []) as ProfileRoleRow[]) {
      const role = Array.isArray(row.company_roles) ? row.company_roles[0] : row.company_roles;
      if (!role?.name) continue;
      const bucket = rolesByPerson.get(row.profile_id) ?? [];
      bucket.push(role.name);
      rolesByPerson.set(row.profile_id, bucket);
    }

    if (teamRows.length) {
      lines.push("\nTEAM MEMBERS (name [access role] — skills):");
      const grouped = new Map<string, string[]>();
      const seen = new Set<string>();
      const skillIndex = new Map<string, string[]>(); // role/craft -> [people]
      for (const row of teamRows) {
        const person = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
        const label = person?.full_name ?? person?.email ?? "Unknown";
        const skills = rolesByPerson.get(row.user_id) ?? [];
        const divisionName = nameOf.get(row.division_id) ?? slugOf.get(row.division_id) ?? "?";
        const bucket = grouped.get(divisionName) ?? [];
        bucket.push(`${label} [${row.role}]${skills.length ? ` — ${skills.join(", ")}` : " — no skill role set"}`);
        grouped.set(divisionName, bucket);
        if (!seen.has(label)) {
          seen.add(label);
          for (const s of skills) {
            const arr = skillIndex.get(s) ?? [];
            arr.push(label);
            skillIndex.set(s, arr);
          }
        }
      }
      for (const [divisionName, people] of grouped) {
        lines.push(`- ${divisionName}: ${people.join("; ")}`);
      }
      if (skillIndex.size) {
        lines.push("\nSKILLS → WHO CAN DO IT (use this to assign tasks by craft):");
        for (const [skill, people] of skillIndex) {
          lines.push(`- ${skill}: ${[...new Set(people)].join(", ")}`);
        }
      }
    }
  }

  const recentDocs = (docs ?? []) as DocRow[];
  lines.push(`\nDOCUMENTS (${recentDocs.length} most recent):`);
  for (const doc of recentDocs) {
    const division = Array.isArray(doc.divisions) ? doc.divisions[0] : doc.divisions;
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
