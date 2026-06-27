"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { canManageProject, loadUserWorkspaceAccess } from "@/lib/server-access";

import type { LooseSupabase as DB } from "@/lib/supabase/loose-client";
type Result = { ok: true } | { error: string };

async function db(): Promise<DB> {
  return (await createClient()) as unknown as DB;
}

const ALLOWED_RELEASE_STATUS = ["planned", "released", "archived"] as const;

export async function createRelease(input: {
  projectId: string;
  name: string;
  targetDate: string | null;
}): Promise<Result> {
  const supabase = await db();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  const name = input.name.trim().slice(0, 80);
  if (!name) return { error: "Release name is required." };
  const { access } = await loadUserWorkspaceAccess(supabase, user.id);
  if (!(await canManageProject(supabase, input.projectId, access))) {
    return { error: "Only project managers can create releases." };
  }
  const { error } = await supabase.from("project_releases").insert({
    project_id: input.projectId,
    name,
    target_date: input.targetDate || null,
    status: "planned",
  });
  if (error) return { error: error.message };
  revalidatePath("/tasks");
  revalidatePath("/roadmap");
  return { ok: true };
}

export async function releaseRelease(releaseId: string): Promise<Result> {
  const supabase = await db();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  const { error } = await supabase
    .from("project_releases")
    .update({ status: "released", released_at: new Date().toISOString() })
    .eq("id", releaseId);
  if (error) return { error: error.message };
  revalidatePath("/roadmap");
  return { ok: true };
}

export async function updateRelease(releaseId: string, patch: {
  name?: string;
  targetDate?: string | null;
  status?: string;
}): Promise<Result> {
  const supabase = await db();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  const clean: Record<string, unknown> = {};
  if (patch.name !== undefined) clean.name = patch.name.trim().slice(0, 80);
  if (patch.targetDate !== undefined) clean.target_date = patch.targetDate;
  if (patch.status !== undefined) {
    if (!(ALLOWED_RELEASE_STATUS as readonly string[]).includes(patch.status)) {
      return { error: "Invalid status." };
    }
    clean.status = patch.status;
  }
  const { error } = await supabase.from("project_releases").update(clean).eq("id", releaseId);
  if (error) return { error: error.message };
  revalidatePath("/roadmap");
  return { ok: true };
}

export async function deleteRelease(releaseId: string): Promise<Result> {
  const supabase = await db();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  const { error } = await supabase.from("project_releases").delete().eq("id", releaseId);
  if (error) return { error: error.message };
  revalidatePath("/roadmap");
  return { ok: true };
}