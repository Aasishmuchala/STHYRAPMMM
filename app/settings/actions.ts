"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

type Result = { ok: true } | { error: string };

/* eslint-disable @typescript-eslint/no-explicit-any */
async function db(): Promise<SupabaseClient<any, any, any>> {
  return (await createClient()) as unknown as SupabaseClient<any, any, any>;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function done(): Result {
  revalidatePath("/settings");
  revalidatePath("/");
  return { ok: true };
}

export async function saveAppearance(theme: string, wallpaper: string | null): Promise<Result> {
  const supabase = await db();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  const { error } = await supabase.from("profiles").update({ theme, wallpaper }).eq("id", user.id);
  if (error) return { error: error.message };
  const jar = await cookies();
  const opts = { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" as const };
  jar.set("sthyra-theme", theme, opts);
  if (wallpaper) jar.set("sthyra-wallpaper", wallpaper, opts);
  else jar.delete("sthyra-wallpaper");
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
  const supabase = await db();
  if (!userId || !divisionId) return { error: "Pick a member and a division" };
  const { error } = await supabase.from("division_members").insert({ user_id: userId, division_id: divisionId, role });
  if (error) return { error: error.message };
  return done();
}

export async function removeMembership(id: string): Promise<Result> {
  const supabase = await db();
  const { error } = await supabase.from("division_members").delete().eq("id", id);
  if (error) return { error: error.message };
  return done();
}
