import type { SupabaseClient } from "@supabase/supabase-js";

// NOTE: @supabase/supabase-js (this version) infers `never` for `.select()` result rows even
// with the full generated types (verified). So the query/mutation helpers take a loose client;
// typed reads are restored per-query via `.returns<T>()`. RLS enforces all access at runtime.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = SupabaseClient<any, any, any>;

type TaskRow = {
  id: string;
  title: string;
  priority: "low" | "med" | "high";
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

export async function getDashboard(supabase: DB, today: Date, userId: string) {
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
    supabase.from("division_members").select("division_id,role"),
    supabase.from("divisions").select("id,slug,name").order("slug"),
    supabase.from("transactions").select("division_id,direction,amount_paise").is("deleted_at", null).gte("occurred_on", monthStart),
    supabase.from("invoices").select("number,counterparty,amount_paise,status,due_on,division_id").is("deleted_at", null),
    supabase.from("tasks").select("id,title,priority,status:status_key,due_date,division_id,divisions(slug,name),stage:task_stages!tasks_status_key_fkey(is_done)").is("deleted_at", null).order("due_date", { nullsFirst: false }).returns<TaskRow[]>(),
    supabase.from("projects").select("division_id,status").is("deleted_at", null),
    supabase.from("documents").select("title,doc_type,body_md,updated_at,divisions(name,slug)").is("deleted_at", null).eq("status", "active").order("updated_at", { ascending: false }).limit(1).returns<DocRow[]>(),
  ]);

  const openTasks = (tasks ?? []).filter((task) => !task.stage?.is_done);

  const isOwner = profile?.global_role === "owner";
  const isLeadAnywhere = isOwner || (memberships ?? []).some((m) => m.role === "lead");
  const canSeeFinances = isLeadAnywhere;

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

  const divisionHealth = (divisions ?? []).map((d) => {
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
    navDivisions: (divisions ?? []).map((d) => ({ slug: d.slug, name: d.name.replace(/^Sthyra\s+/, "") })),
    finance: { moneyIn, moneyOut, owed, margin, overdueCount: overdue.length },
    divisionHealth,
    myTasks,
    attention,
    doc,
  };
}

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
