import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { buildWorkspaceAccess } from "@/lib/access";
import { AppShell } from "@/components/shell/AppShell";
import { AutomationsView } from "@/components/automations/AutomationsView";
import { initials } from "@/lib/format";
import { loadAiConsoleData } from "@/lib/ai/loadAiConsoleData";

import type { LooseSupabase as DB } from "@/lib/supabase/loose-client";

export const dynamic = "force-dynamic";

export default async function AutomationsPage() {
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

  const [divisionsRes, projectsRes, rulesRes, webhooksRes, aiData] = await Promise.all([
    supabase.from("divisions").select("id,slug,name").order("slug"),
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
    loadAiConsoleData(supabase),
  ]);

  const divisions = (divisionsRes.data ?? []) as { id: string; slug: string; name: string }[];

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