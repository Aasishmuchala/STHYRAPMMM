import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { buildWorkspaceAccess } from "@/lib/access";
import { AppShell } from "@/components/shell/AppShell";
import { initials } from "@/lib/format";
import { loadAiConsoleData } from "@/lib/ai/loadAiConsoleData";
import { BurndownChart, type BurndownPoint } from "@/components/reports/BurndownChart";

import type { LooseSupabase as DB } from "@/lib/supabase/loose-client";

export const dynamic = "force-dynamic";

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

  // Pick the most recent active cycle with at least one task.
  const [divisionsRes, cyclesRes, aiData] = await Promise.all([
    supabase.from("divisions").select("id,slug,name").order("slug"),
    supabase
      .from("project_cycles")
      .select("id,name,project_id,starts_on,ends_on,status,projects(name,division_id)")
      .eq("status", "active")
      .order("starts_on", { ascending: false })
      .limit(5)
      .returns<{ id: string; name: string; project_id: string; starts_on: string | null; ends_on: string | null; status: string; projects: { name: string; division_id: string } | { name: string; division_id: string }[] | null }[]>(),
    loadAiConsoleData(supabase),
  ]);

  const divisions = (divisionsRes.data ?? []) as { id: string; slug: string; name: string }[];
  const cycles = (cyclesRes.data ?? []) as { id: string; name: string; project_id: string; starts_on: string | null; ends_on: string | null; status: string; projects: { name: string; division_id: string } | { name: string; division_id: string }[] | null }[];

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
    chartData = (burndown ?? []).map((row) => ({
      day: row.day,
      total: row.total_tasks,
      done: row.done_tasks,
    }));
  }

  return (
    <AppShell
      divisions={divisions.map((d) => ({ slug: d.slug, name: d.name.replace(/^Sthyra\s+/, "") }))}
      canSeeFinances={access.canSeeFinances}
      canSeePeople={access.canSeePeople}
      isOwner={access.isSuperAdmin}
      initials={initials(profile?.full_name ?? null, profile?.email ?? null)}
      aiInitialData={{
        configured: aiData.configured,
        isOwner: access.isSuperAdmin,
        runs: aiData.runs,
        pending: aiData.pending,
        latestBrief: aiData.latestBrief,
        spendToday: aiData.spendToday,
        spendMonth: aiData.spendMonth,
        runCount: aiData.runCount,
      }}
    >
      <main id="main">
        <header className="subhead">
          <div>
            <div className="label" style={{ marginBottom: 9 }}>Reports</div>
            <h1>Burndown, velocity, cycle health</h1>
            <p className="head-sub">Time-series views of your work — powered by the <code>cycle_burndown_v1</code> view.</p>
          </div>
        </header>
        <section className="glass" style={{ padding: 18, marginBottom: 16 }}>
          <h3 style={{ marginBottom: 12 }}>Burndown — {chartTitle}</h3>
          {chartData.length === 0 ? (
            <p className="sub">No data for the most recent active cycle. Run a cycle with tasks to see burndown.</p>
          ) : (
            <BurndownChart data={chartData} />
          )}
        </section>
        <section className="glass" style={{ padding: 18 }}>
          <h3 style={{ marginBottom: 12 }}>Upcoming reports</h3>
          <ul className="sub" style={{ paddingLeft: 18 }}>
            <li>Velocity chart (last 5 cycles) — needs task_history entries</li>
            <li>Cumulative flow diagram — needs task stage history</li>
            <li>Cycle time / lead time histograms — needs task_history entries</li>
          </ul>
          <p className="sub">These reports light up as soon as <code>tasks_history_trigger</code> has been writing rows long enough to mine.</p>
        </section>
      </main>
    </AppShell>
  );
}