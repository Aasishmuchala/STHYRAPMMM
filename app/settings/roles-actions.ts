"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { loadUserWorkspaceAccess } from "@/lib/server-access";
import type { SupabaseClient } from "@supabase/supabase-js";

type Result = { ok: true } | { error: string };

/* eslint-disable @typescript-eslint/no-explicit-any */
async function db(): Promise<SupabaseClient<any, any, any>> {
  return (await createClient()) as unknown as SupabaseClient<any, any, any>;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

async function ownerOnly() {
  const supabase = await db();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, isOwner: false };
  const { access } = await loadUserWorkspaceAccess(supabase, user.id);
  return { supabase, user, isOwner: access.isSuperAdmin };
}

/** Replace the full set of skill roles for one person. Owner only. */
export async function setProfileRoles(profileId: string, roleIds: string[]): Promise<Result> {
  const { supabase, user, isOwner } = await ownerOnly();
  if (!user) return { error: "Not authenticated" };
  if (!isOwner) return { error: "Only the owner can assign roles." };
  if (!profileId) return { error: "Pick a person." };

  // Validate the role ids against the catalogue.
  const { data: validRoles } = await supabase.from("company_roles").select("id");
  const valid = new Set((validRoles ?? []).map((r: { id: string }) => r.id));
  const clean = [...new Set(roleIds)].filter((id) => valid.has(id));

  const { error: delErr } = await supabase.from("profile_roles").delete().eq("profile_id", profileId);
  if (delErr) return { error: delErr.message };
  if (clean.length > 0) {
    const rows = clean.map((roleId) => ({ profile_id: profileId, role_id: roleId }));
    const { error: insErr } = await supabase.from("profile_roles").insert(rows);
    if (insErr) return { error: insErr.message };
  }
  revalidatePath("/settings");
  revalidatePath("/people");
  return { ok: true };
}

/** Add a new role to the catalogue. Owner only. */
export async function addCompanyRole(name: string): Promise<Result> {
  const { user, isOwner, supabase } = await ownerOnly();
  if (!user) return { error: "Not authenticated" };
  if (!isOwner) return { error: "Only the owner can add roles." };
  const clean = name.trim().slice(0, 80);
  if (!clean) return { error: "Enter a role name." };
  const { error } = await supabase.from("company_roles").insert({ name: clean, sort: 100 });
  if (error) return { error: error.message.includes("duplicate") ? "That role already exists." : error.message };
  revalidatePath("/settings");
  return { ok: true };
}

/** Remove a role from the catalogue. Owner only. */
export async function removeCompanyRole(id: string): Promise<Result> {
  const { user, isOwner, supabase } = await ownerOnly();
  if (!user) return { error: "Not authenticated" };
  if (!isOwner) return { error: "Only the owner can remove roles." };
  const { error } = await supabase.from("company_roles").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/settings");
  return { ok: true };
}
