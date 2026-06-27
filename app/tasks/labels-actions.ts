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

const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export async function createLabel(input: {
  projectId: string;
  name: string;
  color: string;
}): Promise<Result> {
  const supabase = await db();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  const name = input.name.trim().slice(0, 32);
  if (!name) return { error: "Label name is required." };
  if (!COLOR_RE.test(input.color)) return { error: "Color must be a hex code like #6b7280." };

  const { access } = await loadUserWorkspaceAccess(supabase, user.id);
  if (!(await canManageProject(supabase, input.projectId, access))) {
    return { error: "Only project managers can create labels." };
  }

  const { error } = await supabase.from("task_labels").insert({
    project_id: input.projectId,
    name,
    color: input.color,
  });
  if (error) return { error: error.message };
  revalidatePath("/tasks");
  return { ok: true };
}

export async function assignLabel(taskId: string, labelId: string): Promise<Result> {
  const supabase = await db();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  const { error } = await supabase.from("task_label_assignments").insert({
    task_id: taskId,
    label_id: labelId,
  });
  if (error && !error.message.includes("duplicate")) return { error: error.message };
  revalidatePath("/tasks");
  return { ok: true };
}

export async function unassignLabel(taskId: string, labelId: string): Promise<Result> {
  const supabase = await db();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  const { error } = await supabase
    .from("task_label_assignments")
    .delete()
    .eq("task_id", taskId)
    .eq("label_id", labelId);
  if (error) return { error: error.message };
  revalidatePath("/tasks");
  return { ok: true };
}

export async function deleteLabel(labelId: string): Promise<Result> {
  const supabase = await db();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  const { error } = await supabase.from("task_labels").delete().eq("id", labelId);
  if (error) return { error: error.message };
  revalidatePath("/tasks");
  return { ok: true };
}