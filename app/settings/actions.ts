"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { normalizeAccentHex } from "@/lib/appearance";
import { loadUserWorkspaceAccess, canManageDivision } from "@/lib/server-access";
import type { SupabaseClient } from "@supabase/supabase-js";

type Result = { ok: true } | { error: string };

/* eslint-disable @typescript-eslint/no-explicit-any */
async function db(): Promise<SupabaseClient<any, any, any>> {
  return (await createClient()) as unknown as SupabaseClient<any, any, any>;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

async function currentUser() {
  const supabase = await db();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

function done(): Result {
  revalidatePath("/settings");
  revalidatePath("/");
  return { ok: true };
}

function normalizeDivisionSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

export async function saveAppearance(
  theme: string,
  wallpaper: string | null,
  accent: string | null = null,
): Promise<Result> {
  const supabase = await db();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  const cleanAccent = normalizeAccentHex(accent);
  const { error } = await supabase
    .from("profiles")
    .update({ theme, wallpaper, accent_color: cleanAccent })
    .eq("id", user.id);
  if (error) return { error: error.message };
  const jar = await cookies();
  const opts = { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" as const };
  jar.set("sthyra-theme", theme, opts);
  if (wallpaper) jar.set("sthyra-wallpaper", wallpaper, opts);
  else jar.set("sthyra-wallpaper", "", { ...opts, maxAge: 0 });
  if (cleanAccent) jar.set("sthyra-accent", cleanAccent, opts);
  else jar.set("sthyra-accent", "", { ...opts, maxAge: 0 });
  return { ok: true };
}

export async function updateProfile(fullName: string): Promise<Result> {
  const supabase = await db();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  const { error } = await supabase.from("profiles").update({ full_name: fullName.trim() || null }).eq("id", user.id);
  if (error) return { error: error.message };
  return done();
}

export async function addInvite(
  email: string, fullName: string, globalRole: string,
  divisionId: string | null, divisionRole: string,
): Promise<Result> {
  const supabase = await db();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  const e = email.trim().toLowerCase();
  if (!e || !e.includes("@")) return { error: "Enter a valid email" };
  const { error } = await supabase.from("invite_allowlist").insert({
    email: e,
    full_name: fullName.trim() || null,
    global_role: globalRole,
    invite_division_id: divisionId,
    invite_division_role: divisionId ? divisionRole : null,
    invited_by: user.id,
  });
  if (error) return { error: error.message };
  return done();
}

export async function removeInvite(email: string): Promise<Result> {
  const supabase = await db();
  const { error } = await supabase.from("invite_allowlist").delete().eq("email", email);
  if (error) return { error: error.message };
  return done();
}

export async function addMembership(userId: string, divisionId: string, role: string): Promise<Result> {
  const { supabase, user } = await currentUser();
  if (!user) return { error: "Not authenticated" };
  if (!userId || !divisionId) return { error: "Pick a member and a division" };
  const { access } = await loadUserWorkspaceAccess(supabase, user.id);
  if (!canManageDivision(access, divisionId)) {
    return { error: "Only the super admin, company owner, or that division's lead can add members here." };
  }
  if (!access.isSuperAdmin && role === "owner") {
    return { error: "Only the super admin can assign a company owner." };
  }
  if (!access.isSuperAdmin && role === "lead" && !access.companyOwnerDivisionIds.has(divisionId)) {
    return { error: "Only the super admin or this company's owner can grant lead access." };
  }

  const { data: existingMembership, error: existingMembershipError } = await supabase
    .from("division_members")
    .select("id,role")
    .eq("user_id", userId)
    .eq("division_id", divisionId)
    .maybeSingle<{ id: string; role: string }>();
  if (existingMembershipError) return { error: existingMembershipError.message };

  if (!access.isSuperAdmin && existingMembership?.role === "owner") {
    return { error: "Only the super admin can change a company owner." };
  }
  if (!access.isSuperAdmin && existingMembership?.role === "lead" && !access.companyOwnerDivisionIds.has(divisionId)) {
    return { error: "Only the super admin or this company's owner can change lead access." };
  }

  if (existingMembership) {
    const { error } = await supabase
      .from("division_members")
      .update({ role })
      .eq("id", existingMembership.id);
    if (error) return { error: error.message };
    return done();
  }

  const { error } = await supabase
    .from("division_members")
    .insert({ user_id: userId, division_id: divisionId, role });
  if (error) return { error: error.message };
  return done();
}

export async function removeMembership(id: string): Promise<Result> {
  const { supabase, user } = await currentUser();
  if (!user) return { error: "Not authenticated" };
  const { data: membership, error: membershipError } = await supabase
    .from("division_members")
    .select("division_id,role")
    .eq("id", id)
    .maybeSingle<{ division_id: string; role: string }>();
  if (membershipError) return { error: membershipError.message };
  if (!membership) return { error: "Membership not found." };

  const { access } = await loadUserWorkspaceAccess(supabase, user.id);
  if (!canManageDivision(access, membership.division_id)) {
    return { error: "Only the super admin, company owner, or that division's lead can remove this membership." };
  }
  if (!access.isSuperAdmin && membership.role === "owner") {
    return { error: "Only the super admin can remove a company owner." };
  }
  if (!access.isSuperAdmin && membership.role === "lead" && !access.companyOwnerDivisionIds.has(membership.division_id)) {
    return { error: "Only the super admin or this company's owner can remove lead access." };
  }

  const { error } = await supabase.from("division_members").delete().eq("id", id);
  if (error) return { error: error.message };
  return done();
}

export async function createDivision(name: string, slug: string): Promise<Result> {
  const { supabase, user } = await currentUser();
  if (!user) return { error: "Not authenticated" };

  const { access } = await loadUserWorkspaceAccess(supabase, user.id);
  if (!access.isSuperAdmin) {
    return { error: "Only the super admin can create a company." };
  }

  const cleanName = name.trim();
  const cleanSlug = normalizeDivisionSlug(slug || name);
  if (!cleanName) return { error: "Company name is required." };
  if (!cleanSlug) return { error: "Use letters or numbers for the company slug." };

  const { error } = await supabase.from("divisions").insert({ name: cleanName, slug: cleanSlug });
  if (error) return { error: error.message };
  return done();
}
