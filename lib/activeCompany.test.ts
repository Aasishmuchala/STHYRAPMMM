import { describe, it, expect } from "vitest";
import { resolveActiveCompany, ALL_COMPANIES, type CompanyDivision } from "./activeCompany";

const DIVS: CompanyDivision[] = [
  { id: "d1", slug: "alpha", name: "Alpha" },
  { id: "d2", slug: "bravo", name: "Bravo" },
  { id: "d3", slug: "charlie", name: "Charlie" },
];

describe("resolveActiveCompany", () => {
  it("defaults to the first accessible company when no cookie is set", () => {
    const r = resolveActiveCompany(null, DIVS, true);
    expect(r.activeSlug).toBe("alpha");
    expect(r.activeDivisionId).toBe("d1");
    expect(r.scopeDivisionIds).toEqual(["d1"]);
    expect(r.isAll).toBe(false);
  });

  it("scopes to a single company by slug", () => {
    const r = resolveActiveCompany("bravo", DIVS, true);
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

  it("a stale/unknown slug falls back to the first company, never the mixed view", () => {
    const r = resolveActiveCompany("deleted-co", DIVS, true);
    expect(r.activeDivisionId).toBe("d1");
    expect(r.scopeDivisionIds).toEqual(["d1"]);
  });

  it("handles a user with no accessible companies", () => {
    const r = resolveActiveCompany("alpha", [], true);
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
