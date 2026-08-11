import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { AiConsole } from "@/components/ai/AiConsole";
import { loadAiConsoleDataCached } from "@/lib/ai/loadAiConsoleData";
import { deriveAiPolicy } from "@/lib/ai/policy";
import { initials } from "@/lib/format";
import {
  getWorkspaceContext,
  loadShellUserSummaryCached,
} from "@/lib/workspaceContext";

export const dynamic = "force-dynamic";

export default async function AiPage() {
  const ctx = await getWorkspaceContext();
  if (!ctx) redirect("/login");
  const supabase = ctx.supabase;
  const user = ctx.user;
  const profile = ctx.profile;

  const policy = deriveAiPolicy(profile?.global_role, ctx.memberships);
  if (!policy.canUseAssistant) redirect("/");

  const isOwner = policy.audience === "owner";
  const aiData = await loadAiConsoleDataCached(supabase, user.id);
  const divisions = ctx.divisions;
  const shellUser = await loadShellUserSummaryCached({
    profile,
    memberships: ctx.memberships,
    accessibleDivisions: divisions,
    canPickAll: isOwner,
  });

  return (
    <AppShell
      divisions={divisions.map((d) => ({ slug: d.slug, name: d.name.replace(/^Sthyra\s+/, "") }))}
      canSeeFinances={isOwner}
      canSeePeople={policy.canSeePeople}
      isOwner={isOwner}
      initials={initials(profile?.full_name ?? null, profile?.email ?? null)}
      userName={shellUser.userName}
      userRoleLabel={shellUser.userRoleLabel}
      aiInitialData={{
        configured: aiData.configured,
        isOwner,
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
            <div className="label" style={{ marginBottom: 9 }}>Assistant</div>
            <h1>AI Command</h1>
            <p className="head-sub">
              {isOwner
                ? "Ask anything about your business, get a morning brief, and let it draft tasks and notes - every rupee it spends is logged."
                : policy.audience === "lead"
                  ? "Ask about your team's work, delivery load, and visible docs. Finance and private business data stay hidden."
                  : "Ask about your visible tasks, current work, and docs. Finance and private team data stay hidden."}
            </p>
          </div>
        </header>
        <AiConsole
          configured={aiData.configured}
          isOwner={isOwner}
          runs={aiData.runs}
          pending={aiData.pending}
          latestBrief={aiData.latestBrief}
          spendToday={aiData.spendToday}
          spendMonth={aiData.spendMonth}
          runCount={aiData.runCount}
        />
      </main>
    </AppShell>
  );
}
