import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/shell/AppShell";
import { SettingsView } from "@/components/settings/SettingsView";
import { initials } from "@/lib/format";
import type { DivisionOpt } from "@/lib/tasks-types";

type Member = { id: string; full_name: string | null; email: string | null; global_role: string };
type Membership = { id: string; user_id: string; division_id: string; role: string };

export default async function SettingsPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as unknown as SupabaseClient<any, any, any>;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: myMemberships }, { data: divisions }] = await Promise.all([
    supabase.from("profiles").select("full_name,email,global_role,theme,wallpaper,accent_color").eq("id", user.id).maybeSingle(),
    supabase.from("division_members").select("role,division_id").eq("user_id", user.id),
    supabase.from("divisions").select("id,slug,name").order("slug"),
  ]);
  const isOwner = profile?.global_role === "owner";
  const myMem = (myMemberships ?? []) as { role: string; division_id: string }[];
  const isLeadAnywhere = myMem.some((m) => m.role === "lead");
  const canSeeFinances = isOwner || isLeadAnywhere;
  const canManageTeam = isOwner || isLeadAnywhere;

  const divs: DivisionOpt[] = (divisions ?? []).map((d: DivisionOpt) => ({ id: d.id, slug: d.slug, name: d.name }));
  const leadableDivisions: DivisionOpt[] = isOwner ? divs : divs.filter((d) => myMem.some((m) => m.role === "lead" && m.division_id === d.id));
  const leadableDivisionIds = leadableDivisions.map((division) => division.id);

  let members: Member[] = [];
  let memberships: Membership[] = [];
  if (canManageTeam) {
    const membershipQuery = isOwner
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
  if (isOwner) {
    const { data } = await supabase.rpc("omega_key_status");
    omegaStatus = (data as typeof omegaStatus) ?? { configured: false };
  }

  const allowedThemes = new Set(["slate", "daybreak", "mist", "harbor"]);
  const normalizedTheme = allowedThemes.has(profile?.theme ?? "") ? (profile?.theme ?? "slate") : "slate";

  return (
    <AppShell divisions={divs.map((d) => ({ slug: d.slug, name: d.name.replace(/^Sthyra\s+/, "") }))} canSeeFinances={canSeeFinances} isOwner={isOwner} initials={initials(profile?.full_name ?? null, profile?.email ?? null)}>
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
          isOwner={isOwner}
          canManageTeam={canManageTeam}
          leadableDivisions={leadableDivisions}
          members={members}
          memberships={memberships}
          divisions={divs}
          initialTheme={normalizedTheme}
          initialWallpaper={profile?.wallpaper ?? null}
          initialAccent={profile?.accent_color ?? null}
          omegaStatus={omegaStatus}
        />
      </main>
    </AppShell>
  );
}
