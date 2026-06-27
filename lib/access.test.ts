import { describe, it, expect } from "vitest";
import {
  buildWorkspaceAccess,
  isSuperAdminRole,
  hasRoleForDivision,
  SUPER_ADMIN_ROLES,
  DIVISION_WORKSPACE_ROLES,
  DIVISION_MANAGER_ROLES,
  DIVISION_FINANCE_ROLES,
  DIVISION_PEOPLE_ROLES,
} from "./access";

describe("isSuperAdminRole", () => {
  it("returns true for super_admin", () => {
    expect(isSuperAdminRole("super_admin")).toBe(true);
  });
  it("returns true for owner (audit medium — owner is workspace-wide)", () => {
    expect(isSuperAdminRole("owner")).toBe(true);
  });
  it("returns false for lead/member/accountant", () => {
    expect(isSuperAdminRole("lead")).toBe(false);
    expect(isSuperAdminRole("member")).toBe(false);
    expect(isSuperAdminRole("accountant")).toBe(false);
  });
  it("returns false for null/undefined", () => {
    expect(isSuperAdminRole(null)).toBe(false);
    expect(isSuperAdminRole(undefined)).toBe(false);
  });
});

describe("role lists", () => {
  it("SUPER_ADMIN_ROLES contains super_admin and owner", () => {
    expect(Array.from(SUPER_ADMIN_ROLES)).toContain("super_admin");
    expect(Array.from(SUPER_ADMIN_ROLES)).toContain("owner");
  });
  it("DIVISION_WORKSPACE_ROLES covers the workspace", () => {
    expect(Array.from(DIVISION_WORKSPACE_ROLES)).toEqual(expect.arrayContaining(["owner", "lead", "member"]));
  });
  it("DIVISION_MANAGER_ROLES does NOT include accountant", () => {
    expect(Array.from(DIVISION_MANAGER_ROLES)).not.toContain("accountant");
    expect(Array.from(DIVISION_MANAGER_ROLES)).toEqual(expect.arrayContaining(["owner", "lead"]));
  });
  it("DIVISION_FINANCE_ROLES includes accountant", () => {
    expect(Array.from(DIVISION_FINANCE_ROLES)).toContain("accountant");
    expect(Array.from(DIVISION_FINANCE_ROLES)).toContain("owner");
    expect(Array.from(DIVISION_FINANCE_ROLES)).toContain("lead");
  });
  it("DIVISION_PEOPLE_ROLES does NOT include accountant", () => {
    expect(Array.from(DIVISION_PEOPLE_ROLES)).not.toContain("accountant");
    expect(Array.from(DIVISION_PEOPLE_ROLES)).toEqual(expect.arrayContaining(["owner", "lead"]));
  });
});

describe("hasRoleForDivision", () => {
  it("returns true for matching role", () => {
    expect(hasRoleForDivision("lead", ["lead", "owner"])).toBe(true);
  });
  it("returns false for non-matching role", () => {
    expect(hasRoleForDivision("member", ["lead", "owner"])).toBe(false);
  });
  it("handles null role", () => {
    expect(hasRoleForDivision(null, ["lead"])).toBe(false);
  });
});

describe("buildWorkspaceAccess", () => {
  it("grants super_admin everything", () => {
    const access = buildWorkspaceAccess("super_admin", []);
    expect(access.isSuperAdmin).toBe(true);
    expect(access.canSeeFinances).toBe(true);
    expect(access.canSeePeople).toBe(true);
  });
  it("grants owner global role everything", () => {
    const access = buildWorkspaceAccess("owner", []);
    expect(access.isSuperAdmin).toBe(true);
  });
  it("member gets workspace but not finances or people", () => {
    const access = buildWorkspaceAccess(null, [
      { role: "member", division_id: "d1" },
    ]);
    expect(access.isSuperAdmin).toBe(false);
    expect(access.canSeeFinances).toBe(false);
    expect(access.canSeePeople).toBe(false);
    expect(access.workspaceDivisionIds.has("d1")).toBe(true);
  });
  it("lead gets workspace + finances + people", () => {
    const access = buildWorkspaceAccess(null, [
      { role: "lead", division_id: "d1" },
    ]);
    expect(access.canSeeFinances).toBe(true);
    expect(access.canSeePeople).toBe(true);
    expect(access.financeDivisionIds.has("d1")).toBe(true);
  });
  it("accountant gets workspace + finances but NOT people", () => {
    const access = buildWorkspaceAccess(null, [
      { role: "accountant", division_id: "d1" },
    ]);
    expect(access.canSeeFinances).toBe(true);
    expect(access.canSeePeople).toBe(false);
  });
  it("owner at the division level sets companyOwnerDivisionIds", () => {
    const access = buildWorkspaceAccess(null, [
      { role: "owner", division_id: "d1" },
    ]);
    expect(access.companyOwnerDivisionIds.has("d1")).toBe(true);
  });
});
