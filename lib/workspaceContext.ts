import { cache } from "react";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  ACTIVE_COMPANY_COOKIE,
  resolveActiveCompany,
  type CompanyDivision,
} from "@/lib/activeCompany";
import {
  deriveShellUserSummary,
  loadShellUserSummary as loadShellUserSummaryUncached,
  type ShellUserSummary,
} from "@/lib/shellUser";
import type { MembershipLike } from "@/lib/access";

// Shared, per-render-cached loaders for the bits every workspace page needs:
//   - the auth user
//   - the profile row
//   - the user's division memberships
//   - the divisions the workspace knows about
//   - the active-company cookie
//   - the shell-user label/name
//
// Every workspace page does these fetches in some form. Wrapping them in
// React's `cache()` means (a) a back-to-back second page in the same request
// shares the result, (b) sibling components within the same render that call
// `getWorkspaceContext()` don't double-fetch, and (c) the serial `await cookies()`
// hops at the bottom of each page become free.

// `SupabaseClient<any, any, any>` matches the loose-client pattern every page
// already uses; the generated DB types are too narrow for `.select()`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseClient = SupabaseClient<any, any, any>;

export type WorkspaceProfile = {
  full_name: string | null;
  email: string | null;
  global_role: string | null;
};

export type WorkspaceMembership = {
  division_id: string;
  role: string;
};

export type WorkspaceContext = {
  supabase: LooseClient;
  user: { id: string; email?: string | null };
  profile: WorkspaceProfile | null;
  memberships: WorkspaceMembership[];
  divisions: CompanyDivision[];
};

/**
 * Fetches the auth user + profile + memberships + divisions in one
 * `Promise.all`. Returns `null` when the request has no session (the calling
 * page is responsible for `redirect("/login")`).
 *
 * Wrapped in `cache()` so two pages in the same render share the result.
 */
export const getWorkspaceContext = cache(async (): Promise<WorkspaceContext | null> => {
  const supabase = (await createClient()) as unknown as LooseClient;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: profile }, { data: memberships }, { data: divisions }] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name,email,global_role")
      .eq("id", user.id)
      .maybeSingle<WorkspaceProfile>(),
    supabase
      .from("division_members")
      .select("division_id,role")
      .eq("user_id", user.id)
      .returns<WorkspaceMembership[]>(),
    supabase
      .from("divisions")
      .select("id,slug,name")
      .order("slug")
      .returns<CompanyDivision[]>(),
  ]);

  return {
    supabase,
    user,
    profile: profile ?? null,
    memberships: (memberships ?? []) as WorkspaceMembership[],
    divisions: (divisions ?? []) as CompanyDivision[],
  };
});

/**
 * Cached wrapper around the original `readActiveCompanySlug()`. Reads the
 * cookie store once per render instead of on every page's bottom-of-tree call.
 */
export const readActiveCompanySlugCached = cache(async (): Promise<string | null> => {
  const store = await cookies();
  const value = store.get(ACTIVE_COMPANY_COOKIE)?.value?.trim();
  return value ? value : null;
});

/**
 * Cached wrapper around `loadShellUserSummary`. Pure given the same inputs;
 * cache by the inputs so two pages using the same context don't derive twice.
 */
export const loadShellUserSummaryCached = cache(
  async (input: {
    profile: WorkspaceProfile | null;
    memberships: MembershipLike[];
    accessibleDivisions: CompanyDivision[];
    canPickAll: boolean;
  }): Promise<ShellUserSummary> => {
    // Reuse the existing async helper so we get the same behaviour as every
    // page had before. We pass through the cached cookie read.
    return loadShellUserSummaryUncached({
      profile: input.profile,
      memberships: input.memberships,
      accessibleDivisions: input.accessibleDivisions,
      canPickAll: input.canPickAll,
    });
  },
);

/**
 * Pure helper for the rare page that already has the context and just needs
 * the derived ShellUserSummary without another cookie read.
 */
export function deriveShellUserSummaryCached(
  profile: WorkspaceProfile | null,
  memberships: MembershipLike[],
  accessibleDivisions: CompanyDivision[],
  canPickAll: boolean,
  activeCompanySlug: string | null,
): ShellUserSummary {
  return deriveShellUserSummary({
    profile,
    memberships,
    accessibleDivisions,
    canPickAll,
    activeCompanySlug,
  });
}

/**
 * One-shot helper for the common case: resolve the active-company given a
 * workspace context. Returns the same shape `resolveActiveCompany` returns.
 */
export function resolveActiveCompanyForContext(
  context: WorkspaceContext,
  accessibleDivisions: CompanyDivision[],
  canPickAll: boolean,
  activeCompanySlug: string | null,
) {
  return resolveActiveCompany(activeCompanySlug, accessibleDivisions, canPickAll);
}