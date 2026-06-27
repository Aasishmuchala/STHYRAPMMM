import type { SupabaseClient } from "@supabase/supabase-js";
import { buildWorkspaceAccess, type MembershipLike } from "@/lib/access";

import type { LooseSupabase as DB } from "@/lib/supabase/loose-client";

export async function loadUserWorkspaceAccess(supabase: DB, userId: string) {
  const [{ data: profile }, { data: memberships }] = await Promise.all([
    supabase.from("profiles").select("global_role").eq("id", userId).maybeSingle<{ global_role: string | null }>(),
    supabase.from("division_members").select("division_id,role").eq("user_id", userId),
  ]);

  const membershipRows = (memberships ?? []) as MembershipLike[];
  return {
    globalRole: profile?.global_role ?? null,
    memberships: membershipRows,
    access: buildWorkspaceAccess(profile?.global_role, membershipRows),
  };
}

export function canAccessWorkspaceDivision(access: ReturnType<typeof buildWorkspaceAccess>, divisionId: string | null | undefined) {
  return Boolean(
    divisionId && (access.isSuperAdmin || access.workspaceDivisionIds.has(divisionId))
  );
}

export function canManageDivision(access: ReturnType<typeof buildWorkspaceAccess>, divisionId: string | null | undefined) {
  return Boolean(
    divisionId && (access.isSuperAdmin || access.manageableDivisionIds.has(divisionId))
  );
}

export function canAccessFinanceDivision(access: ReturnType<typeof buildWorkspaceAccess>, divisionId: string | null | undefined) {
  return Boolean(
    divisionId && (access.isSuperAdmin || access.financeDivisionIds.has(divisionId))
  );
}

export function canAccessPeople(access: ReturnType<typeof buildWorkspaceAccess>) {
  return access.canSeePeople;
}

export async function canManageProject(
  supabase: DB,
  projectId: string,
  access: ReturnType<typeof buildWorkspaceAccess>,
): Promise<boolean> {
  if (access.isSuperAdmin) return true;
  const { data } = await supabase
    .from("projects")
    .select("division_id")
    .eq("id", projectId)
    .maybeSingle<{ division_id: string }>();
  if (!data?.division_id) return false;
  return access.manageableDivisionIds.has(data.division_id);
}
