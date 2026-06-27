import { NextResponse } from "next/server";
import { createClient as createAdminClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import {
  companyEmailMessage,
  isCompanyEmail,
  normalizeEmail,
} from "@/lib/auth/companyEmail";

type Payload = {
  email?: string;
  password?: string;
  fullName?: string;
};

type AdminUser = User;
/* eslint-disable @typescript-eslint/no-explicit-any */
type LooseAdmin = SupabaseClient<any, any, any>;
/* eslint-enable @typescript-eslint/no-explicit-any */

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;

  return createAdminClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function signupErrorMessage(message: string) {
  if (/already been registered|already registered|user already exists|duplicate/i.test(message)) {
    return "An account with that email already exists. Try signing in instead.";
  }
  if (/password/i.test(message)) {
    return "Use a stronger password with at least 8 characters.";
  }
  return message || "Couldn't create the account right now.";
}

async function findUserByEmail(admin: NonNullable<ReturnType<typeof getServiceClient>>, email: string) {
  let page = 1;
  const perPage = 200;

  while (page <= 10) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) return { error, user: null as AdminUser | null };

    const user = data.users.find((entry) => normalizeEmail(entry.email ?? "") === email) ?? null;
    if (user) return { error: null, user };
    if (data.users.length < perPage) break;
    page += 1;
  }

  return { error: null, user: null as AdminUser | null };
}

async function applyInviteMembership(admin: LooseAdmin, userId: string, email: string) {
  const { data: invite, error: inviteError } = await admin
    .from("invite_allowlist")
    .select("global_role,invite_division_id,invite_division_role")
    .eq("email", email)
    .maybeSingle<{
      global_role: string | null;
      invite_division_id: string | null;
      invite_division_role: string | null;
    }>();
  if (inviteError) return { error: inviteError.message };
  if (!invite) return { ok: true } as const;

  const { error: profileError } = await admin
    .from("profiles")
    .update({ global_role: invite.global_role ?? "member" })
    .eq("id", userId);
  if (profileError) return { error: profileError.message };

  if (invite.invite_division_id && invite.invite_division_role) {
    const { error: membershipError } = await admin
      .from("division_members")
      .upsert(
        {
          user_id: userId,
          division_id: invite.invite_division_id,
          role: invite.invite_division_role,
        },
        { onConflict: "user_id,division_id" }
      );
    if (membershipError) return { error: membershipError.message };
  }

  return { ok: true } as const;
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as Payload | null;
  const email = normalizeEmail(payload?.email ?? "");
  const password = payload?.password ?? "";
  const fullName = payload?.fullName?.trim() || null;

  if (!isCompanyEmail(email)) {
    return NextResponse.json({ error: companyEmailMessage() }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Use at least 8 characters." }, { status: 400 });
  }

  const admin = getServiceClient();
  if (!admin) {
    return NextResponse.json({ error: "Supabase service role is not configured." }, { status: 500 });
  }
  const looseAdmin = admin as unknown as LooseAdmin;

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  let user = data.user ?? null;

  if (error) {
    if (!/already been registered|already registered|user already exists|duplicate/i.test(error.message)) {
      return NextResponse.json({ error: signupErrorMessage(error.message) }, { status: 400 });
    }

    const existing = await findUserByEmail(admin, email);
    if (existing.error) {
      return NextResponse.json({ error: existing.error.message }, { status: 500 });
    }
    if (!existing.user) {
      return NextResponse.json({ error: "That account already exists, but we couldn't load it right now. Try again." }, { status: 409 });
    }

    if (existing.user.last_sign_in_at) {
      return NextResponse.json({ error: "An account with that email already exists. Sign in instead." }, { status: 409 });
    }

    const { data: updated, error: updateError } = await admin.auth.admin.updateUserById(existing.user.id, {
      password,
      email_confirm: true,
      user_metadata: {
        ...(existing.user.user_metadata ?? {}),
        full_name: fullName,
      },
    });
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    user = updated.user ?? existing.user;
  }

  const userId = user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Supabase created no user record." }, { status: 500 });
  }

  const { error: profileError } = await admin.from("profiles").upsert({
    id: userId,
    email,
    full_name: fullName,
    global_role: "member",
    is_active: true,
  });
  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  const inviteResult = await applyInviteMembership(looseAdmin, userId, email);
  if ("error" in inviteResult) {
    return NextResponse.json({ error: inviteResult.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
