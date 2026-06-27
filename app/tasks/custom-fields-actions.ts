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

const ALLOWED_FIELD_TYPES = ["text", "number", "select", "date", "checkbox"] as const;

export async function defineField(input: {
  projectId: string;
  key: string;
  label: string;
  type: string;
  options?: string[];
}): Promise<Result> {
  const supabase = await db();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  if (!(ALLOWED_FIELD_TYPES as readonly string[]).includes(input.type)) {
    return { error: `Invalid field type. Allowed: ${ALLOWED_FIELD_TYPES.join(", ")}` };
  }
  const key = input.key.trim().toLowerCase();
  if (!/^[a-z][a-z0-9_]{0,31}$/.test(key)) return { error: "Key must be lowercase letters, digits, or underscores." };
  const { access } = await loadUserWorkspaceAccess(supabase, user.id);
  if (!(await canManageProject(supabase, input.projectId, access))) {
    return { error: "Only project managers can define fields." };
  }
  const { error } = await supabase.from("task_field_definitions").insert({
    project_id: input.projectId,
    key,
    label: input.label.trim().slice(0, 80),
    type: input.type,
    options: input.options ?? [],
  });
  if (error) return { error: error.message };
  revalidatePath("/tasks");
  return { ok: true };
}

export async function setFieldValue(taskId: string, fieldId: string, value: unknown): Promise<Result> {
  const supabase = await db();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  const { error } = await supabase.from("task_field_values").upsert(
    { task_id: taskId, field_id: fieldId, value: value as never },
    { onConflict: "task_id,field_id" },
  );
  if (error) return { error: error.message };
  revalidatePath("/tasks");
  return { ok: true };
}

export async function deleteField(fieldId: string): Promise<Result> {
  const supabase = await db();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  const { error } = await supabase.from("task_field_definitions").delete().eq("id", fieldId);
  if (error) return { error: error.message };
  revalidatePath("/tasks");
  return { ok: true };
}