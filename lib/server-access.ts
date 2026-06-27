import type { SupabaseClient } from "@supabase/supabase-js";
import { buildWorkspaceAccess, type MembershipLike } from "@/lib/access";

/* eslint-disable @typescript-eslint/no-explicit-any */
type DB = SupabaseClient<any, any, any>;
/* eslint-enable @typescript-eslint/no-explicit-any */

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
