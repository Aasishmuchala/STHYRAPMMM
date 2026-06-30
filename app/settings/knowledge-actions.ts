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

export async function addKnowledge(title: string, body: string, tagsCsv: string): Promise<Result> {
  const { supabase, user, isOwner } = await ownerOnly();
  if (!user) return { error: "Not authenticated" };
  if (!isOwner) return { error: "Only the owner can add knowledge." };
  const t = title.trim().slice(0, 200);
  const b = body.trim().slice(0, 8000);
  if (!t || !b) return { error: "Add a title and body." };
  const tags = tagsCsv.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean).slice(0, 12);
  const { error } = await supabase.from("ai_knowledge").insert({ title: t, body: b, tags, created_by: user.id });
  if (error) return { error: error.message };
  revalidatePath("/settings");
  return { ok: true };
}

export async function deleteKnowledge(id: string): Promise<Result> {
  const { supabase, user, isOwner } = await ownerOnly();
  if (!user) return { error: "Not authenticated" };
  if (!isOwner) return { error: "Only the owner can remove knowledge." };
  const { error } = await supabase.from("ai_knowledge").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/settings");
  return { ok: true };
}
