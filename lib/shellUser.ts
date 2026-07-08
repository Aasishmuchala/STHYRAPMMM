import { readActiveCompanySlug, resolveActiveCompany, type CompanyDivision } from "@/lib/activeCompany";
import { isSuperAdminRole, type MembershipLike } from "@/lib/access";

type ShellProfile = {
  full_name: string | null | undefined;
  email: string | null | undefined;
  global_role: string | null | undefined;
};

type ShellUserSummaryInput = {
  profile: ShellProfile | null | undefined;
  memberships: MembershipLike[];
  accessibleDivisions: CompanyDivision[];
  canPickAll: boolean;
  activeCompanySlug: string | null;
};

export type ShellUserSummary = {
  userName: string;
  userRoleLabel: string;
};

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  owner: "Owner",
  lead: "Lead",
  accountant: "Accountant",
  member: "Member",
};

export function formatShellRoleLabel(role: string | null | undefined): string {
  const normalized = role?.trim().toLowerCase() ?? "";
  if (!normalized) return "Member";
  if (ROLE_LABELS[normalized]) return ROLE_LABELS[normalized];
  return normalized
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function shellUserName(profile: ShellProfile | null | undefined): string {
  const fullName = profile?.full_name?.trim();
  const email = profile?.email?.trim();
  return fullName || email || "Workspace User";
}

export function deriveShellUserSummary({
  profile,
  memberships,
  accessibleDivisions,
  canPickAll,
  activeCompanySlug,
}: ShellUserSummaryInput): ShellUserSummary {
  const userName = shellUserName(profile);

  if (isSuperAdminRole(profile?.global_role)) {
    return { userName, userRoleLabel: "Super Admin" };
  }

  const activeCompany = resolveActiveCompany(activeCompanySlug, accessibleDivisions, canPickAll);
  if (activeCompany.activeDivisionId) {
    const membership = memberships.find((row) => row.division_id === activeCompany.activeDivisionId);
    if (membership?.role) {
      return { userName, userRoleLabel: formatShellRoleLabel(membership.role) };
    }
  }

  return {
    userName,
    userRoleLabel: activeCompany.isAll ? "Multi-company access" : "Member",
  };
}

export async function loadShellUserSummary({
  profile,
  memberships,
  accessibleDivisions,
  canPickAll,
}: Omit<ShellUserSummaryInput, "activeCompanySlug">): Promise<ShellUserSummary> {
  const activeCompanySlug = await readActiveCompanySlug();
  return deriveShellUserSummary({
    profile,
    memberships,
    accessibleDivisions,
    canPickAll,
    activeCompanySlug,
  });
}
