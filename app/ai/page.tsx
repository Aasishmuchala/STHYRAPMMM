import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/shell/AppShell";
import { AiConsole } from "@/components/ai/AiConsole";
import { loadAiConsoleData } from "@/lib/ai/loadAiConsoleData";
import { deriveAiPolicy } from "@/lib/ai/policy";
import { initials } from "@/lib/format";

import type { LooseSupabase as DB } from "@/lib/supabase/loose-client";

export const dynamic = "force-dynamic";

export default async function AiPage() {
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

  const policy = deriveAiPolicy(profile?.global_role, memberships ?? []);
  if (!policy.canUseAssistant) redirect("/");

  const isOwner = policy.audience === "owner";
  const [divisionsRes, aiData] = await Promise.all([
    supabase.from("divisions").select("id,slug,name").order("slug"),
    loadAiConsoleData(supabase),
  ]);
  const divisions = (divisionsRes.data ?? []) as { id: string; slug: string; name: string }[];

  return (
    <AppShell
      divisions={divisions.map((d) => ({ slug: d.slug, name: d.name.replace(/^Sthyra\s+/, "") }))}
      canSeeFinances={isOwner}
      canSeePeople={policy.canSeePeople}
      isOwner={isOwner}
      initials={initials(profile?.full_name ?? null, profile?.email ?? null)}
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
