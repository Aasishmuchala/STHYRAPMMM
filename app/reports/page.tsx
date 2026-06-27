import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { buildWorkspaceAccess } from "@/lib/access";
import { AppShell } from "@/components/shell/AppShell";
import { initials } from "@/lib/format";
import { loadAiConsoleData } from "@/lib/ai/loadAiConsoleData";
import { BurndownChart, type BurndownPoint } from "@/components/reports/BurndownChart";
import { ActivityLog, type ActivityEntry } from "@/components/reports/ActivityLog";

import type { LooseSupabase as DB } from "@/lib/supabase/loose-client";

export const dynamic = "force-dynamic";

type ActivityRow = {
  id: number;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_label: string | null;
  changes: Record<string, { old: string | null; new: string | null }> | null;
  created_at: string;
};

export default async function ReportsPage() {
  const supabase = (await createClient()) as unknown as DB;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name,email,global_role")
    .eq("id", user.id)
    .maybeSingle<{ full_name: string | null; email: string | null; global_role: string | null }>();
  const { data: memberships } = await supabase
    .from("division_members")
    .select("role,division_id")
    .eq("user_id", user.id)
    .returns<{ role: string; division_id: string }[]>();
  const access = buildWorkspaceAccess(profile?.global_role, memberships ?? []);

  const { data: divisionsRes } = await supabase.from("divisions").select("id,slug,name").order("slug");
  const divisions = (divisionsRes ?? []) as { id: string; slug: string; name: string }[];
  const aiData = await loadAiConsoleData(supabase);

  const shellProps = {
    divisions: divisions.map((d) => ({ slug: d.slug, name: d.name.replace(/^Sthyra\s+/, "") })),
    canSeeFinances: access.canSeeFinances,
    canSeePeople: access.canSeePeople,
    isOwner: access.isSuperAdmin,
    initials: initials(profile?.full_name ?? null, profile?.email ?? null),
    aiInitialData: {
      configured: aiData.configured,
      isOwner: access.isSuperAdmin,
      runs: aiData.runs,
      pending: aiData.pending,
      latestBrief: aiData.latestBrief,
      spendToday: aiData.spendToday,
      spendMonth: aiData.spendMonth,
      runCount: aiData.runCount,
    },
  };

  // Reports + audit trail are owner-only.
  if (!access.isSuperAdmin) {
    return (
      <AppShell {...shellProps}>
        <main id="main" data-testid="main">
          <header className="subhead">
            <div>
              <div className="label" style={{ marginBottom: 9 }}>Reports</div>
              <h1>Audit log &amp; reports</h1>
            </div>
          </header>
          <section className="glass" style={{ padding: 22 }}>
            <p className="sub">The audit log and reports are available to owners only.</p>
          </section>
        </main>
      </AppShell>
    );
  }

  // ----- Activity / audit log -----
  const { data: logRows } = await supabase
    .from("activity_log")
    .select("id,actor_id,action,entity_type,entity_label,changes,created_at")
    .order("created_at", { ascending: false })
    .limit(400)
    .returns<ActivityRow[]>();
  const rows = logRows ?? [];

  const actorIds = Array.from(new Set(rows.map((r) => r.actor_id).filter((x): x is string => Boolean(x))));
  const actorNames = new Map<string, string>();
  if (actorIds.length > 0) {
    const { data: actors } = await supabase
      .from("profiles")
      .select("id,full_name,email")
      .in("id", actorIds)
      .returns<{ id: string; full_name: string | null; email: string | null }[]>();
    for (const a of actors ?? []) {
      actorNames.set(a.id, a.full_name || a.email || "Unknown");
    }
  }

  const entries: ActivityEntry[] = rows.map((r) => ({
    id: r.id,
    actor_name: r.actor_id ? (actorNames.get(r.actor_id) ?? "Unknown") : "System",
    action: r.action,
    entity_type: r.entity_type,
    entity_label: r.entity_label,
    changes: r.changes,
    created_at: r.created_at,
  }));

  // ----- Burndown (secondary) -----
  const { data: cyclesRes } = await supabase
    .from("project_cycles")
    .select("id,name,project_id,starts_on,status,projects(name)")
    .eq("status", "active")
    .order("starts_on", { ascending: false })
    .limit(1)
    .returns<{ id: string; name: string; projects: { name: string } | { name: string }[] | null }[]>();
  const cycles = cyclesRes ?? [];

  let chartData: BurndownPoint[] = [];
  let chartTitle = "Pick a cycle";
  if (cycles[0]) {
    const c = cycles[0];
    const project = Array.isArray(c.projects) ? c.projects[0] : c.projects;
    chartTitle = `${c.name} (${project?.name ?? "?"})`;
    const { data: burndown } = await supabase
      .from("cycle_burndown_v1")
      .select("day,total_tasks,done_tasks")
      .eq("cycle_id", c.id)
      .order("day")
      .returns<{ day: string; total_tasks: number; done_tasks: number }[]>();
    chartData = (burndown ?? []).map((row) => ({ day: row.day, total: row.total_tasks, done: row.done_tasks }));
  }

  return (
    <AppShell {...shellProps}>
      <main id="main" data-testid="main">
        <header className="subhead">
          <div>
            <div className="label" style={{ marginBottom: 9 }}>Reports</div>
            <h1>Audit log &amp; reports</h1>
            <p className="head-sub">Every create, update, and delete across the workspace — who did what, and when. Appearance and password changes are not tracked.</p>
          </div>
        </header>

        <section className="glass" style={{ padding: 18, marginBottom: 16 }}>
          <h3 style={{ marginBottom: 14 }}>Activity</h3>
          {entries.length === 0 ? (
            <p className="sub">No activity recorded yet. Actions across tasks, finances, clients, documents and more will appear here as they happen.</p>
          ) : (
            <ActivityLog entries={entries} />
          )}
        </section>

        <section className="glass" style={{ padding: 18 }}>
          <h3 style={{ marginBottom: 12 }}>Burndown — {chartTitle}</h3>
          {chartData.length === 0 ? (
            <p className="sub">No data for the most recent active cycle. Run a cycle with tasks to see burndown.</p>
          ) : (
            <BurndownChart data={chartData} />
          )}
        </section>
      </main>
    </AppShell>
  );
}
