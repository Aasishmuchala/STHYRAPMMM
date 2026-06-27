import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildWorkspaceAccess } from "@/lib/access";
import type { TaskPriority } from "@/lib/tasks-types";

// NOTE: @supabase/supabase-js (this version) infers `never` for `.select()` result rows even
// with the full generated types (verified). So the query/mutation helpers take a loose client;
// typed reads are restored per-query via `.returns<T>()`. RLS enforces all access at runtime
// (see supabase/migrations/20260627110000_roles_company_access_and_task_assignment.sql and the
// 20260628_audit_fix_and_features.sql migration that closes every gap).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = SupabaseClient<any, any, any>;

// Caps to keep dashboard queries bounded as the workspace grows. Without these,
// a busy division would load every row in the table on every render.
const DASHBOARD_CAPS = {
  tasks: 200,
  invoices: 500,
  txns: 2000,
  projects: 500,
} as const;

type TaskRow = {
  id: string;
  title: string;
  priority: TaskPriority;
  status: string;
  due_date: string | null;
  division_id: string;
  divisions: { slug: string; name: string } | null;
  stage: { is_done: boolean } | null;
};
type DocRow = {
  title: string;
  doc_type: string | null;
  body_md: string | null;
  updated_at: string;
  divisions: { name: string; slug: string } | null;
};

export type Dashboard = Awaited<ReturnType<typeof getDashboard>>;

/**
 * Loads the home dashboard. React `cache()` dedupes calls within a single render
 * pass — if /home and a partial render both call getDashboard for the same
 * user, only one round-trip to Supabase fires.
 */
export const getDashboard = cache(async function getDashboard(supabase: DB, today: Date, userId: string) {
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
  const todayStr = today.toISOString().slice(0, 10);

  const [
    { data: profile },
    { data: memberships },
    { data: divisions },
    { data: txns },
    { data: invoices },
    { data: tasks },
    { data: projects },
    { data: docs },
  ] = await Promise.all([
    supabase.from("profiles").select("full_name,email,global_role").eq("id", userId).maybeSingle(),
    supabase.from("division_members").select("division_id,role").eq("user_id", userId),
    supabase.from("divisions").select("id,slug,name").order("slug"),
    supabase.from("transactions").select("division_id,direction,amount_paise").is("deleted_at", null).gte("occurred_on", monthStart).limit(DASHBOARD_CAPS.txns),
    supabase.from("invoices").select("number,counterparty,amount_paise,status,due_on,division_id").is("deleted_at", null).limit(DASHBOARD_CAPS.invoices),
    supabase.from("tasks").select("id,title,priority,status:workflow_stage_id,due_date,division_id,divisions(slug,name),stage:workflow_stages!tasks_workflow_stage_id_fkey(is_done)").is("deleted_at", null).order("due_date", { nullsFirst: false }).limit(DASHBOARD_CAPS.tasks).returns<TaskRow[]>(),
    supabase.from("projects").select("division_id,status").is("deleted_at", null).limit(DASHBOARD_CAPS.projects),
    supabase.from("documents").select("title,doc_type,body_md,updated_at,divisions(name,slug)").is("deleted_at", null).eq("status", "active").order("updated_at", { ascending: false }).limit(1).returns<DocRow[]>(),
  ]);

  const openTasks = (tasks ?? []).filter((task) => !task.stage?.is_done);

  const access = buildWorkspaceAccess(profile?.global_role, (memberships ?? []) as { division_id: string; role: string }[]);
  const isOwner = access.isSuperAdmin;
  const canSeeFinances = access.canSeeFinances;

  const T = txns ?? [];
  const moneyIn = sum(T.filter((t) => t.direction === "in").map((t) => t.amount_paise));
  const moneyOut = sum(T.filter((t) => t.direction === "out").map((t) => t.amount_paise));
  const margin = moneyIn > 0 ? ((moneyIn - moneyOut) / moneyIn) * 100 : 0;

  const unpaid = (invoices ?? []).filter((i) => i.status === "sent" || i.status === "overdue");
  const owed = sum(unpaid.map((i) => i.amount_paise));
  const overdue = (invoices ?? []).filter((i) => i.status === "overdue");

  // Per-division revenue (in) this month + project/task counts
  const revByDiv = new Map<string, number>();
  for (const t of T) if (t.direction === "in") revByDiv.set(t.division_id, (revByDiv.get(t.division_id) ?? 0) + t.amount_paise);
  const maxRev = Math.max(1, ...revByDiv.values());
  const activeProjByDiv = countBy((projects ?? []).filter((p) => p.status === "active").map((p) => p.division_id));
  const openTaskByDiv = countBy(openTasks.map((task) => task.division_id));

  const divisionHealth = (divisions ?? [])
    .filter((d) => access.isSuperAdmin || access.workspaceDivisionIds.has(d.id) || access.financeDivisionIds.has(d.id))
    .map((d) => {
    const rev = revByDiv.get(d.id) ?? 0;
    return {
      slug: d.slug,
      name: d.name.replace(/^Sthyra\s+/, ""),
      revenuePaise: rev,
      bar: Math.round((rev / maxRev) * 100),
      activeProjects: activeProjByDiv.get(d.id) ?? 0,
      openTasks: openTaskByDiv.get(d.id) ?? 0,
      canSeeFinances,
    };
    });

  const myTasks = openTasks.slice(0, 6).map((t) => ({
    id: t.id,
    title: t.title,
    priority: t.priority,
    division: (t.divisions?.name ?? "").replace(/^Sthyra\s+/, ""),
    due: t.due_date,
  }));

  const attention = [
    ...overdue.map((i) => ({
      kind: "danger" as const,
      title: `Invoice ${i.number} overdue${dueDays(i.due_on, todayStr)}`,
      value: i.amount_paise,
      isMoney: true,
    })),
  ];

  const doc = docs?.[0]
    ? {
        title: docs[0].title,
        docType: docs[0].doc_type,
        division: docs[0].divisions?.name ?? "",
        body: docs[0].body_md ?? "",
      }
    : null;

  return {
    profile: profile ?? null,
    isOwner,
    canSeeFinances,
    navDivisions: (divisions ?? [])
      .filter((d) => access.isSuperAdmin || access.workspaceDivisionIds.has(d.id) || access.financeDivisionIds.has(d.id))
      .map((d) => ({ slug: d.slug, name: d.name.replace(/^Sthyra\s+/, "") })),
    finance: { moneyIn, moneyOut, owed, margin, overdueCount: overdue.length },
    divisionHealth,
    myTasks,
    attention,
    doc,
  };
});

function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}
function countBy(keys: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const k of keys) m.set(k, (m.get(k) ?? 0) + 1);
  return m;
}
function dueDays(due: string | null, todayStr: string): string {
  if (!due) return "";
  const d = Math.round((new Date(todayStr).getTime() - new Date(due).getTime()) / 86400000);
  return d > 0 ? ` ${d} days` : "";
}
