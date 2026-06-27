import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { buildWorkspaceAccess } from "@/lib/access";
import { AppShell } from "@/components/shell/AppShell";
import { initials } from "@/lib/format";
import { loadAiConsoleData } from "@/lib/ai/loadAiConsoleData";

import type { LooseSupabase as DB } from "@/lib/supabase/loose-client";

export const dynamic = "force-dynamic";

export default async function RoadmapPage() {
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

  const [divisionsRes, releasesRes, okrsRes, aiData] = await Promise.all([
    supabase.from("divisions").select("id,slug,name").order("slug"),
    supabase
      .from("project_releases")
      .select("id,name,target_date,status,project_id,projects(name,division_id)")
      .order("target_date", { ascending: true })
      .limit(30)
      .returns<{ id: string; name: string; target_date: string | null; status: string; project_id: string; projects: { name: string; division_id: string } | { name: string; division_id: string }[] | null }[]>(),
    supabase
      .from("okrs")
      .select("id,title,description,target_metric,current_value,period,division_id")
      .order("period", { ascending: false })
      .limit(20)
      .returns<{ id: string; title: string; description: string | null; target_metric: Record<string, unknown>; current_value: number; period: string; division_id: string | null }[]>(),
    loadAiConsoleData(supabase),
  ]);

  const divisions = (divisionsRes.data ?? []) as { id: string; slug: string; name: string }[];
  const releases = (releasesRes.data ?? []) as { id: string; name: string; target_date: string | null; status: string; project_id: string; projects: { name: string; division_id: string } | { name: string; division_id: string }[] | null }[];

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
            <div className="label" style={{ marginBottom: 9 }}>Roadmap</div>
            <h1>Releases &amp; OKRs</h1>
            <p className="head-sub">Cross-project shipping dates and the objectives they roll up to.</p>
          </div>
        </header>

        <section className="glass" style={{ padding: 18, marginBottom: 16 }}>
          <h3 style={{ marginBottom: 12 }}>Upcoming releases</h3>
          {releases.length === 0 ? (
            <p className="sub">No releases yet. Create one from a project to anchor the timeline.</p>
          ) : (
            <div className="ftable">
              <table>
                <thead>
                  <tr><th>Release</th><th>Project</th><th>Target</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {releases.map((r) => {
                    const project = Array.isArray(r.projects) ? r.projects[0] : r.projects;
                    return (
                      <tr key={r.id}>
                        <td>{r.name}</td>
                        <td>{project?.name ?? "—"}</td>
                        <td className="mono">{r.target_date ?? "—"}</td>
                        <td><span className={`roadmap-pill roadmap-pill-${r.status}`}>{r.status}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="glass" style={{ padding: 18 }}>
          <h3 style={{ marginBottom: 12 }}>OKRs</h3>
          {okrsRes.data?.length === 0 ? (
            <p className="sub">No OKRs yet. Add one in a division&apos;s hub or via Settings → OKRs (coming soon).</p>
          ) : (
            <div className="okrs-list">
              {(okrsRes.data ?? []).map((o) => {
                const target = (o.target_metric?.target as number) ?? 100;
                const pct = target > 0 ? Math.min(100, Math.round((o.current_value / target) * 100)) : 0;
                return (
                  <div className="okr-card" key={o.id}>
                    <div className="okr-head">
                      <span className="okr-period mono">{o.period}</span>
                      <h4>{o.title}</h4>
                    </div>
                    <div className="okr-barwrap">
                      <div className="okr-bar" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="okr-meta">
                      <span className="mono">{o.current_value} / {target}</span>
                      <span>{pct}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </AppShell>
  );
}
