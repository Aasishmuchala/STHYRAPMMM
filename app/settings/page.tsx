import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/shell/AppShell";
import { SettingsView } from "@/components/settings/SettingsView";
import { buildWorkspaceAccess } from "@/lib/access";
import { isAllowedTheme } from "@/lib/appearance";
import { initials } from "@/lib/format";
import type { DivisionOpt } from "@/lib/tasks-types";
import { loadAiConsoleData } from "@/lib/ai/loadAiConsoleData";

type Member = { id: string; full_name: string | null; email: string | null; global_role: string };
type Membership = { id: string; user_id: string; division_id: string; role: string };

export default async function SettingsPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as unknown as SupabaseClient<any, any, any>;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: myMemberships }, { data: divisions }, aiData] = await Promise.all([
    supabase.from("profiles").select("full_name,email,global_role,theme,wallpaper,accent_color").eq("id", user.id).maybeSingle(),
    supabase.from("division_members").select("role,division_id").eq("user_id", user.id),
    supabase.from("divisions").select("id,slug,name").order("slug"),
    loadAiConsoleData(supabase),
  ]);
  const myMem = (myMemberships ?? []) as { role: string; division_id: string }[];
  const access = buildWorkspaceAccess(profile?.global_role, myMem);
  const isSuperAdmin = access.isSuperAdmin;
  const canSeeFinances = access.canSeeFinances;
  const canManageTeam = access.canManageTeams;

  const divs: DivisionOpt[] = (divisions ?? []).map((d: DivisionOpt) => ({ id: d.id, slug: d.slug, name: d.name }));
  const leadableDivisions: DivisionOpt[] = isSuperAdmin
    ? divs
    : divs.filter((d) => access.manageableDivisionIds.has(d.id));
  const leadableDivisionIds = leadableDivisions.map((division) => division.id);

  let members: Member[] = [];
  let memberships: Membership[] = [];
  if (canManageTeam) {
    const membershipQuery = isSuperAdmin
      ? supabase.from("division_members").select("id,user_id,division_id,role")
      : leadableDivisionIds.length > 0
        ? supabase.from("division_members").select("id,user_id,division_id,role").in("division_id", leadableDivisionIds)
        : Promise.resolve({ data: [] as Membership[], error: null });
    const [{ data: mem }, membershipResult] = await Promise.all([
      supabase.from("profiles").select("id,full_name,email,global_role").eq("is_active", true).order("created_at"),
      membershipQuery,
    ]);
    members = (mem ?? []) as Member[];
    memberships = (membershipResult.data ?? []) as Membership[];
  }

  let omegaStatus: { configured: boolean; last4?: string; updated_at?: string } | null = null;
  let companyRoles: { id: string; name: string }[] = [];
  let roleAssignments: Record<string, string[]> = {};
  let knowledge: { id: string; title: string; body: string; tags: string[] }[] = [];
  if (isSuperAdmin) {
    const [{ data }, { data: roles }, { data: pr }, { data: kb }] = await Promise.all([
      supabase.rpc("omega_key_status"),
      supabase.from("company_roles").select("id,name").order("sort").order("name"),
      supabase.from("profile_roles").select("profile_id,role_id"),
      supabase.from("ai_knowledge").select("id,title,body,tags").order("created_at", { ascending: false }),
    ]);
    omegaStatus = (data as typeof omegaStatus) ?? { configured: false };
    companyRoles = (roles ?? []) as { id: string; name: string }[];
    roleAssignments = {};
    for (const row of (pr ?? []) as { profile_id: string; role_id: string }[]) {
      (roleAssignments[row.profile_id] ??= []).push(row.role_id);
    }
    knowledge = (kb ?? []) as { id: string; title: string; body: string; tags: string[] }[];
  }

  const normalizedTheme = isAllowedTheme(profile?.theme) ? profile.theme : "slate";

  return (
    <AppShell
      divisions={divs.map((d) => ({ slug: d.slug, name: d.name.replace(/^Sthyra\s+/, "") }))}
      canSeeFinances={canSeeFinances}
      isOwner={isSuperAdmin}
      initials={initials(profile?.full_name ?? null, profile?.email ?? null)}
      aiInitialData={{
        configured: aiData.configured,
        isOwner: isSuperAdmin,
        runs: aiData.runs,
        pending: aiData.pending,
        latestBrief: aiData.latestBrief,
        spendToday: aiData.spendToday,
        spendMonth: aiData.spendMonth,
        runCount: aiData.runCount,
      }}
    >
      <main>
        <header className="subhead">
          <div>
            <div className="label" style={{ marginBottom: 9 }}>Settings</div>
            <h1>Workspace</h1>
            <p className="head-sub">Your account, your team, the AI key, and how the app looks.</p>
          </div>
        </header>
        <SettingsView
          profile={profile ?? { full_name: null, email: user.email ?? null, global_role: "member" }}
          isOwner={isSuperAdmin}
          canManageTeam={canManageTeam}
          leadableDivisions={leadableDivisions}
          members={members}
          memberships={memberships}
          divisions={divs}
          initialTheme={normalizedTheme}
          initialWallpaper={profile?.wallpaper ?? null}
          initialAccent={profile?.accent_color ?? null}
          omegaStatus={omegaStatus}
          companyRoles={companyRoles}
          roleAssignments={roleAssignments}
          knowledge={knowledge}
        />
      </main>
    </AppShell>
  );
}
