import { describe, it, expect } from "vitest";
import { resolveActiveCompany, ALL_COMPANIES, type CompanyDivision } from "./activeCompany";

const DIVS: CompanyDivision[] = [
  { id: "d1", slug: "alpha", name: "Alpha" },
  { id: "d2", slug: "bravo", name: "Bravo" },
  { id: "d3", slug: "charlie", name: "Charlie" },
];

describe("resolveActiveCompany", () => {
  it("owners default to 'all companies' when no cookie is set", () => {
    const r = resolveActiveCompany(null, DIVS, true);
    expect(r.isAll).toBe(true);
    expect(r.activeSlug).toBe(ALL_COMPANIES);
    expect(r.activeDivisionId).toBeNull();
    expect(r.scopeDivisionIds).toEqual(["d1", "d2", "d3"]);
  });

  it("non-owners default to their first company when no cookie is set", () => {
    const r = resolveActiveCompany(null, DIVS, false);
    expect(r.isAll).toBe(false);
    expect(r.activeSlug).toBe("alpha");
    expect(r.activeDivisionId).toBe("d1");
    expect(r.scopeDivisionIds).toEqual(["d1"]);
  });

  it("an explicit valid slug is honored, even for owners", () => {
    const r = resolveActiveCompany("bravo", DIVS, true);
    expect(r.isAll).toBe(false);
    expect(r.activeDivisionId).toBe("d2");
    expect([...r.scope]).toEqual(["d2"]);
  });

  it("owner can pick 'all companies' to aggregate every accessible division", () => {
    const r = resolveActiveCompany(ALL_COMPANIES, DIVS, true);
    expect(r.isAll).toBe(true);
    expect(r.activeDivisionId).toBeNull();
    expect(r.scopeDivisionIds).toEqual(["d1", "d2", "d3"]);
  });

  it("non-owners cannot use 'all' — they fall back to a single company", () => {
    const r = resolveActiveCompany(ALL_COMPANIES, DIVS, false);
    expect(r.isAll).toBe(false);
    expect(r.activeDivisionId).toBe("d1");
    expect(r.scopeDivisionIds).toEqual(["d1"]);
  });

  it("a stale/unknown slug falls back to the owner default (all companies)", () => {
    const r = resolveActiveCompany("deleted-co", DIVS, true);
    expect(r.isAll).toBe(true);
    expect(r.scopeDivisionIds).toEqual(["d1", "d2", "d3"]);
  });

  it("handles an owner with no accessible companies", () => {
    const r = resolveActiveCompany("alpha", [], true);
    expect(r.activeDivisionId).toBeNull();
    expect(r.scopeDivisionIds).toEqual([]);
  });

  it("handles a non-owner with no accessible companies", () => {
    const r = resolveActiveCompany("alpha", [], false);
    expect(r.activeSlug).toBeNull();
    expect(r.activeDivisionId).toBeNull();
    expect(r.scopeDivisionIds).toEqual([]);
  });

  it("only ever includes ids the user can access (scope ⊆ accessible)", () => {
    const r = resolveActiveCompany(ALL_COMPANIES, DIVS, true);
    for (const id of r.scopeDivisionIds) {
      expect(DIVS.some((d) => d.id === id)).toBe(true);
    }
  });
});
