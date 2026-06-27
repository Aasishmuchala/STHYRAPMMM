export type MembershipLike = {
  division_id: string;
  role: string;
};

export const SUPER_ADMIN_ROLES = new Set(["super_admin", "owner"]);
export const DIVISION_WORKSPACE_ROLES = new Set(["owner", "lead", "member"]);
export const DIVISION_MANAGER_ROLES = new Set(["owner", "lead"]);
export const DIVISION_FINANCE_ROLES = new Set(["owner", "lead", "accountant"]);
export const DIVISION_PEOPLE_ROLES = new Set(["owner", "lead"]);

function pickDivisionIds(memberships: MembershipLike[], allowedRoles: Set<string>) {
  return new Set(
    memberships
      .filter((membership) => allowedRoles.has(membership.role))
      .map((membership) => membership.division_id)
  );
}

export function isSuperAdminRole(globalRole: string | null | undefined) {
  return SUPER_ADMIN_ROLES.has(globalRole ?? "");
}

export function buildWorkspaceAccess(globalRole: string | null | undefined, memberships: MembershipLike[]) {
  const isSuperAdmin = isSuperAdminRole(globalRole);
  const workspaceDivisionIds = pickDivisionIds(memberships, DIVISION_WORKSPACE_ROLES);
  const manageableDivisionIds = pickDivisionIds(memberships, DIVISION_MANAGER_ROLES);
  const financeDivisionIds = pickDivisionIds(memberships, DIVISION_FINANCE_ROLES);
  const peopleDivisionIds = pickDivisionIds(memberships, DIVISION_PEOPLE_ROLES);
  const companyOwnerDivisionIds = pickDivisionIds(memberships, new Set(["owner"]));

  return {
    isSuperAdmin,
    isCompanyOwnerAnywhere: companyOwnerDivisionIds.size > 0,
    canSeeFinances: isSuperAdmin || financeDivisionIds.size > 0,
    canSeePeople: isSuperAdmin || peopleDivisionIds.size > 0,
    canManageTeams: isSuperAdmin || manageableDivisionIds.size > 0,
    workspaceDivisionIds,
    manageableDivisionIds,
    financeDivisionIds,
    peopleDivisionIds,
    companyOwnerDivisionIds,
  };
}

export function hasDivisionRole(
  memberships: MembershipLike[],
  divisionId: string | null | undefined,
  allowedRoles: string[],
) {
  if (!divisionId) return false;
  return memberships.some((m) => m.division_id === divisionId && allowedRoles.includes(m.role));
}

// Convenience overload used by SQL helper parity (lib/server-access.ts).
// Usage: hasRoleForDivision(role, ["lead", "owner"]) -> boolean
export function hasRoleForDivision(
  role: string | null | undefined,
  allowedRoles: string[],
): boolean {
  if (!role) return false;
  return allowedRoles.includes(role);
}
