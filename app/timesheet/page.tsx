import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { buildWorkspaceAccess, hasDivisionRole } from "@/lib/access";
import { loadUserWorkspaceAccess } from "@/lib/server-access";
import { AppShell } from "@/components/shell/AppShell";
import { TimesheetGrid } from "@/components/timesheet/TimesheetGrid";
import { initials } from "@/lib/format";
import { loadAiConsoleData } from "@/lib/ai/loadAiConsoleData";

import type { LooseSupabase as DB } from "@/lib/supabase/loose-client";

export const dynamic = "force-dynamic";

export default async function TimesheetPage() {
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
  if (!access.canSeePeople) redirect("/");

  // Window: last 7 days (Mon -> Sun)
  const today = new Date();
  const day = today.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const weekStart = new Date(today.getTime() + mondayOffset * 86400000);
  const weekEnd = new Date(weekStart.getTime() + 7 * 86400000);
  const startIso = weekStart.toISOString().slice(0, 10);
  const endIso = weekEnd.toISOString().slice(0, 10);

  const [divisionsRes, peopleRes, logsRes, aiData] = await Promise.all([
    supabase.from("divisions").select("id,slug,name").order("slug"),
    supabase
      .from("profiles")
      .select("id,full_name,email,avatar_seed,global_role")
      .eq("is_active", true)
      .order("full_name")
      .returns<{ id: string; full_name: string | null; email: string | null; avatar_seed: string | null; global_role: string | null }[]>(),
    supabase
      .from("task_work_logs")
      .select("id,task_id,profile_id,started_at,minutes,note")
      .gte("started_at", startIso)
      .lt("started_at", endIso)
      .returns<{ id: string; task_id: string; profile_id: string; started_at: string; minutes: number; note: string | null }[]>(),
    loadAiConsoleData(supabase),
  ]);

  const divisions = (divisionsRes.data ?? []) as { id: string; slug: string; name: string }[];
  const people = (peopleRes.data ?? []).filter((p) =>
    access.isSuperAdmin || memberships?.some((m) => m.division_id) // everyone with at least one membership
  );

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
            <div className="label" style={{ marginBottom: 9 }}>Week of {startIso}</div>
            <h1>Timesheet</h1>
            <p className="head-sub">Who logged what this week. Times roll up from per-task logs — no double entry.</p>
          </div>
        </header>
        <TimesheetGrid
          weekStartIso={startIso}
          people={people}
          logs={logsRes.data ?? []}
        />
      </main>
    </AppShell>
  );
}