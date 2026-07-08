import { describe, expect, it } from "vitest";
import { ALL_COMPANIES } from "./activeCompany";
import { deriveShellUserSummary, formatShellRoleLabel } from "./shellUser";

const DIVISIONS = [
  { id: "d1", slug: "studios", name: "Sthyra Studios" },
  { id: "d2", slug: "digital", name: "Sthyra Digital" },
];

describe("formatShellRoleLabel", () => {
  it("formats known roles with product labels", () => {
    expect(formatShellRoleLabel("super_admin")).toBe("Super Admin");
    expect(formatShellRoleLabel("accountant")).toBe("Accountant");
  });

  it("title-cases unknown roles", () => {
    expect(formatShellRoleLabel("project_manager")).toBe("Project Manager");
  });
});

describe("deriveShellUserSummary", () => {
  it("shows the full name when present", () => {
    const summary = deriveShellUserSummary({
      profile: { full_name: "Riya Shah", email: "riya@example.com", global_role: "member" },
      memberships: [{ division_id: "d1", role: "lead" }],
      accessibleDivisions: DIVISIONS,
      canPickAll: false,
      activeCompanySlug: "studios",
    });
    expect(summary).toEqual({ userName: "Riya Shah", userRoleLabel: "Lead" });
  });

  it("falls back to email when the full name is empty", () => {
    const summary = deriveShellUserSummary({
      profile: { full_name: null, email: "riya@example.com", global_role: "member" },
      memberships: [{ division_id: "d1", role: "member" }],
      accessibleDivisions: DIVISIONS,
      canPickAll: false,
      activeCompanySlug: "studios",
    });
    expect(summary.userName).toBe("riya@example.com");
  });

  it("uses the active company membership role", () => {
    const summary = deriveShellUserSummary({
      profile: { full_name: "Riya Shah", email: "riya@example.com", global_role: "member" },
      memberships: [
        { division_id: "d1", role: "member" },
        { division_id: "d2", role: "accountant" },
      ],
      accessibleDivisions: DIVISIONS,
      canPickAll: false,
      activeCompanySlug: "digital",
    });
    expect(summary.userRoleLabel).toBe("Accountant");
  });

  it("keeps super admin as the top-level label", () => {
    const summary = deriveShellUserSummary({
      profile: { full_name: "Owner", email: "owner@example.com", global_role: "super_admin" },
      memberships: [{ division_id: "d1", role: "member" }],
      accessibleDivisions: DIVISIONS,
      canPickAll: true,
      activeCompanySlug: "studios",
    });
    expect(summary.userRoleLabel).toBe("Super Admin");
  });

  it("shows multi-company access in the all-companies view", () => {
    const summary = deriveShellUserSummary({
      profile: { full_name: "Owner", email: "owner@example.com", global_role: "member" },
      memberships: [{ division_id: "d1", role: "owner" }],
      accessibleDivisions: DIVISIONS,
      canPickAll: true,
      activeCompanySlug: ALL_COMPANIES,
    });
    expect(summary.userRoleLabel).toBe("Multi-company access");
  });
});
