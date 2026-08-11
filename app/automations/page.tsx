import { redirect } from "next/navigation";
import { buildWorkspaceAccess } from "@/lib/access";
import { AppShell } from "@/components/shell/AppShell";
import { AutomationsView } from "@/components/automations/AutomationsView";
import { initials } from "@/lib/format";
import { loadAiConsoleDataCached } from "@/lib/ai/loadAiConsoleData";
import {
  getWorkspaceContext,
  loadShellUserSummaryCached,
} from "@/lib/workspaceContext";

export const dynamic = "force-dynamic";

export default async function AutomationsPage() {
  const ctx = await getWorkspaceContext();
  if (!ctx) redirect("/login");
  const supabase = ctx.supabase;
  const user = ctx.user;
  const profile = ctx.profile;

  const access = buildWorkspaceAccess(profile?.global_role, ctx.memberships);

  const [projectsRes, rulesRes, webhooksRes, aiData] = await Promise.all([
    supabase
      .from("projects")
      .select("id,name,division_id")
      .is("deleted_at", null)
      .order("name")
      .returns<{ id: string; name: string; division_id: string }[]>(),
    supabase
      .from("automation_rules")
      .select("id,name,trigger_event,conditions,action,action_payload,enabled,project_id,division_id,created_at")
      .order("created_at", { ascending: false })
      .returns<{ id: string; name: string; trigger_event: string; conditions: Record<string, unknown>; action: string; action_payload: Record<string, unknown>; enabled: boolean; project_id: string | null; division_id: string | null; created_at: string }[]>(),
    supabase
      .from("webhooks")
      .select("id,name,channel,enabled,project_id,division_id")
      .order("created_at", { ascending: false })
      .returns<{ id: string; name: string; channel: string; enabled: boolean; project_id: string | null; division_id: string | null }[]>(),
    loadAiConsoleDataCached(supabase, user.id),
  ]);

  const divisions = ctx.divisions;
  const shellUser = await loadShellUserSummaryCached({
    profile,
    memberships: ctx.memberships,
    accessibleDivisions: divisions,
    canPickAll: access.isSuperAdmin,
  });

  return (
    <AppShell
      divisions={divisions.map((d) => ({ slug: d.slug, name: d.name.replace(/^Sthyra\s+/, "") }))}
      canSeeFinances={access.canSeeFinances}
      canSeePeople={access.canSeePeople}
      isOwner={access.isSuperAdmin}
      initials={initials(profile?.full_name ?? null, profile?.email ?? null)}
      userName={shellUser.userName}
      userRoleLabel={shellUser.userRoleLabel}
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
            <div className="label" style={{ marginBottom: 9 }}>Automations</div>
            <h1>Rules &amp; webhooks</h1>
            <p className="head-sub">When X happens, do Y. Webhooks deliver to Slack, Teams, WhatsApp, or anywhere else.</p>
          </div>
        </header>
        <AutomationsView
          divisions={divisions}
          projects={projectsRes.data ?? []}
          rules={rulesRes.data ?? []}
          webhooks={webhooksRes.data ?? []}
        />
      </main>
    </AppShell>
  );
}
