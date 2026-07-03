import { cookies } from "next/headers";

// A "company" is a row in the `divisions` table (Settings → "Create a company"
// calls createDivision). This module gives the workspace a single, persistent
// "active company" so global pages (Tasks / Projects / Finances) scope to ONE
// company instead of aggregating every division the user can access.
//
// The value is stored in a cookie (readable client-side so the switcher can
// update it without a round-trip) holding a division slug, or the sentinel
// ALL_COMPANIES which only the owner may choose.

export const ACTIVE_COMPANY_COOKIE = "sthyra_active_company";
export const ALL_COMPANIES = "all";

export async function readActiveCompanySlug(): Promise<string | null> {
  const store = await cookies();
  const value = store.get(ACTIVE_COMPANY_COOKIE)?.value?.trim();
  return value ? value : null;
}

export type CompanyDivision = { id: string; slug: string; name: string };

export type ActiveCompany = {
  /** Slug of the active company, ALL_COMPANIES, or null when the user has none. */
  activeSlug: string | null;
  /** Single active company's division id — null for the "all companies" view. */
  activeDivisionId: string | null;
  /** Division ids the current view should include. */
  scope: Set<string>;
  /** Same as `scope`, as an array for `.in("division_id", …)` queries. */
  scopeDivisionIds: string[];
  isAll: boolean;
};

/**
 * Resolve the active company from the cookie slug against the divisions the
 * user may access.
 *
 * Rules:
 *  - a valid, accessible slug is ALWAYS honored → that single company
 *  - otherwise (no cookie / stale slug / explicit "all"):
 *      · owners (canPickAll)  → "All companies" (they see everything by default
 *        and narrow via the switcher — an owner must never be dropped into one
 *        arbitrary, possibly-empty company)
 *      · everyone else        → their FIRST accessible company (employees are
 *        always scoped to the one company they belong to)
 *
 * `accessibleDivs` MUST already be ordered by slug and filtered to what the
 * user can see, so the default here matches the switcher's default label.
 */
export function resolveActiveCompany(
  slug: string | null,
  accessibleDivs: CompanyDivision[],
  canPickAll: boolean,
): ActiveCompany {
  const allIds = accessibleDivs.map((d) => d.id);
  const match = slug ? accessibleDivs.find((d) => d.slug === slug) : undefined;

  // An explicit, valid company pick always wins — including for owners.
  if (match) {
    return {
      activeSlug: match.slug,
      activeDivisionId: match.id,
      scope: new Set([match.id]),
      scopeDivisionIds: [match.id],
      isAll: false,
    };
  }

  // No valid selection. Owners fall back to the all-companies view.
  if (canPickAll) {
    return {
      activeSlug: ALL_COMPANIES,
      activeDivisionId: null,
      scope: new Set(allIds),
      scopeDivisionIds: allIds,
      isAll: true,
    };
  }

  // Non-owners are scoped to their first (usually only) company.
  const first = accessibleDivs[0] ?? null;
  if (!first) {
    return {
      activeSlug: null,
      activeDivisionId: null,
      scope: new Set<string>(),
      scopeDivisionIds: [],
      isAll: false,
    };
  }
  return {
    activeSlug: first.slug,
    activeDivisionId: first.id,
    scope: new Set([first.id]),
    scopeDivisionIds: [first.id],
    isAll: false,
  };
}
