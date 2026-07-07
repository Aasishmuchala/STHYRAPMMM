import { createClient as createAdminClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { divisionSlugForEmail, normalizeEmail } from "@/lib/auth/companyEmail";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type LooseAdmin = SupabaseClient<any, any, any>;
/* eslint-enable @typescript-eslint/no-explicit-any */

export type SignupMetadata = {
  full_name?: string | null;
  signup_otp_hash?: string | null;
  signup_otp_expires?: string | null;
  signup_otp_attempts?: number | null;
  [key: string]: unknown;
};

/** Typed service-role client, or null when env is missing. */
export function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createAdminClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Find an existing auth user by email (paged listUsers scan). */
export async function findAuthUserByEmail(
  admin: NonNullable<ReturnType<typeof getServiceClient>>,
  email: string,
): Promise<{ error: string | null; user: User | null }> {
  const target = normalizeEmail(email);
  let page = 1;
  const perPage = 200;

  while (page <= 10) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) return { error: error.message, user: null };

    const user = data.users.find((entry) => normalizeEmail(entry.email ?? "") === target) ?? null;
    if (user) return { error: null, user };
    if (data.users.length < perPage) break;
    page += 1;
  }
  return { error: null, user: null };
}

/**
 * After email verification: guarantee the member's profile exists (role
 * ALWAYS "member" — everyone who signs up is a member, per product rule) and
 * add them to the company/division their email domain maps to.
 */
export async function provisionMember(
  admin: LooseAdmin,
  userId: string,
  email: string,
  fullName: string | null,
): Promise<{ ok: true } | { error: string }> {
  const normalizedEmail = normalizeEmail(email);

  const { error: profileError } = await admin.from("profiles").upsert({
    id: userId,
    email: normalizedEmail,
    full_name: fullName,
    global_role: "member",
    is_active: true,
  });
  if (profileError) return { error: profileError.message };

  const slug = divisionSlugForEmail(normalizedEmail);
  if (slug) {
    const { data: division, error: divError } = await admin
      .from("divisions")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (divError) return { error: divError.message };

    if (division?.id) {
      const { error: memberError } = await admin
        .from("division_members")
        .upsert(
          { user_id: userId, division_id: division.id, role: "member" },
          { onConflict: "user_id,division_id" },
        );
      if (memberError) return { error: memberError.message };
    }
  }

  return { ok: true };
}
