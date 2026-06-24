"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_TASK_STAGES } from "@/lib/tasks-types";
import type { TaskInput, TaskStage, TaskStatus } from "@/lib/tasks-types";

type Result = { ok: true } | { error: string };
type WorkflowResult<T = void> = T extends void ? Result : { ok: true; data: T } | { error: string };

// The trimmed generated DB types confuse supabase-js into typing insert/update payloads as
// `never`. Mutations are still fully enforced by RLS at runtime; use a loose client here.
/* eslint-disable @typescript-eslint/no-explicit-any */
async function db(): Promise<SupabaseClient<any, any, any>> {
  return (await createClient()) as unknown as SupabaseClient<any, any, any>;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function clean<T extends object>(o: T): T {
  // strip undefined so Supabase doesn't try to set them
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

async function currentUser() {
  const supabase = await db();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

async function canManageWorkflow(supabase: SupabaseClient<any, any, any>, userId: string): Promise<boolean> {
  const [{ data: profile }, { data: memberships }] = await Promise.all([
    supabase.from("profiles").select("global_role").eq("id", userId).maybeSingle(),
    supabase.from("division_members").select("role").eq("user_id", userId),
  ]);
  return profile?.global_role === "owner" || (memberships ?? []).some((m) => m.role === "lead");
}

async function requireWorkflowStage(supabase: SupabaseClient<any, any, any>, status: string) {
  const { data: stage, error } = await supabase
    .from("task_stages")
    .select("key")
    .eq("key", status)
    .maybeSingle();
  if (error) return { error: error.message } as const;
  if (!stage) return { error: "That workflow stage no longer exists." } as const;
  return { ok: true } as const;
}

export async function createTask(input: TaskInput): Promise<Result> {
  const { supabase, user } = await currentUser();
  if (!user) return { error: "Not authenticated" };
  if (!input.title.trim()) return { error: "Title is required" };
  if (!input.division_id) return { error: "Pick a division" };
  const stageCheck = await requireWorkflowStage(supabase, input.status);
  if ("error" in stageCheck) return stageCheck;

  const { error } = await supabase.from("tasks").insert({
    title: input.title.trim(),
    division_id: input.division_id,
    project_id: input.project_id,
    assignee_id: input.assignee_id,
    priority: input.priority,
    status_key: input.status,
    due_date: input.due_date,
    description: input.description,
    created_by: user.id,
  });
  if (error) return { error: error.message };
  revalidatePath("/tasks");
  revalidatePath("/");
  return { ok: true };
}

export async function updateTask(id: string, input: Partial<TaskInput>): Promise<Result> {
  const supabase = await db();
  if (input.status) {
    const stageCheck = await requireWorkflowStage(supabase, input.status);
    if ("error" in stageCheck) return stageCheck;
  }
  const patch = clean({
    title: input.title?.trim(),
    division_id: input.division_id,
    project_id: input.project_id,
    assignee_id: input.assignee_id,
    priority: input.priority,
    status_key: input.status,
    due_date: input.due_date,
    description: input.description,
  });
  const { error } = await supabase.from("tasks").update(patch).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/tasks");
  revalidatePath("/");
  return { ok: true };
}

export async function setTaskStatus(id: string, status: TaskStatus): Promise<Result> {
  const supabase = await db();
  const stageCheck = await requireWorkflowStage(supabase, status);
  if ("error" in stageCheck) return stageCheck;
  const { error } = await supabase.from("tasks").update({ status_key: status }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/tasks");
  revalidatePath("/");
  return { ok: true };
}

function slugifyStage(label: string) {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

async function nextStageOrder(supabase: SupabaseClient<any, any, any>) {
  const { data } = await supabase.from("task_stages").select("position").order("position");
  return (data ?? []).length;
}

export async function createTaskStage(input: {
  label: string;
  color: string;
  is_done?: boolean;
  after_key?: string | null;
}): Promise<WorkflowResult<TaskStage>> {
  const { supabase, user } = await currentUser();
  if (!user) return { error: "Not authenticated" };
  if (!(await canManageWorkflow(supabase, user.id))) return { error: "Only owners and leads can edit the workflow." };

  const label = input.label.trim();
  if (!label) return { error: "Stage name is required." };

  const baseKey = slugifyStage(label);
  if (!baseKey) return { error: "Use letters or numbers in the stage name." };

  const { data: existingKeys, error: existingError } = await supabase.from("task_stages").select("key,position").order("position");
  if (existingError) return { error: existingError.message };

  let key = baseKey;
  let suffix = 2;
  const keySet = new Set((existingKeys ?? []).map((stage) => stage.key));
  while (keySet.has(key)) {
    key = `${baseKey}_${suffix}`;
    suffix += 1;
  }

  const stageList = existingKeys ?? [];
  const insertAfter = input.after_key ? stageList.findIndex((stage) => stage.key === input.after_key) : stageList.length - 1;
  const insertAt = insertAfter >= 0 ? insertAfter + 1 : await nextStageOrder(supabase);

  for (let index = stageList.length - 1; index >= insertAt; index -= 1) {
    const stage = stageList[index];
    const { error } = await supabase.from("task_stages").update({ position: index + 1 }).eq("key", stage.key);
    if (error) return { error: error.message };
  }

  const position = Math.max(0, Math.min(insertAt, stageList.length));
  const stage: TaskStage = {
    key,
    label,
    color: input.color || "var(--accent)",
    position,
    is_done: Boolean(input.is_done),
  };
  const { error } = await supabase.from("task_stages").insert(stage);
  if (error) return { error: error.message };

  revalidatePath("/tasks");
  revalidatePath("/");
  return { ok: true, data: stage };
}

export async function updateTaskStage(
  key: string,
  input: Pick<TaskStage, "label" | "color" | "is_done">
): Promise<Result> {
  const { supabase, user } = await currentUser();
  if (!user) return { error: "Not authenticated" };
  if (!(await canManageWorkflow(supabase, user.id))) return { error: "Only owners and leads can edit the workflow." };

  if (!input.label.trim()) return { error: "Stage name is required." };
  const { error } = await supabase
    .from("task_stages")
    .update({
      label: input.label.trim(),
      color: input.color,
      is_done: input.is_done,
    })
    .eq("key", key);
  if (error) return { error: error.message };

  revalidatePath("/tasks");
  revalidatePath("/");
  return { ok: true };
}

export async function reorderTaskStages(keys: string[]): Promise<Result> {
  const { supabase, user } = await currentUser();
  if (!user) return { error: "Not authenticated" };
  if (!(await canManageWorkflow(supabase, user.id))) return { error: "Only owners and leads can edit the workflow." };
  if (keys.length === 0) return { error: "No stages to reorder." };

  for (let index = 0; index < keys.length; index += 1) {
    const { error } = await supabase.from("task_stages").update({ position: index }).eq("key", keys[index]);
    if (error) return { error: error.message };
  }

  revalidatePath("/tasks");
  revalidatePath("/");
  return { ok: true };
}

export async function deleteTaskStage(key: string): Promise<Result> {
  const { supabase, user } = await currentUser();
  if (!user) return { error: "Not authenticated" };
  if (!(await canManageWorkflow(supabase, user.id))) return { error: "Only owners and leads can edit the workflow." };
  if (DEFAULT_TASK_STAGES.some((stage) => stage.key === key)) return { error: "Default stages cannot be deleted." };

  const [{ count }, { data: stages, error: stageError }] = await Promise.all([
    supabase.from("tasks").select("id", { head: true, count: "exact" }).eq("status_key", key).is("deleted_at", null),
    supabase.from("task_stages").select("key,position").order("position"),
  ]);
  if (stageError) return { error: stageError.message };
  if ((count ?? 0) > 0) return { error: "Move tasks out of this stage before deleting it." };

  const { error } = await supabase.from("task_stages").delete().eq("key", key);
  if (error) return { error: error.message };

  const remaining = (stages ?? []).filter((stage) => stage.key !== key);
  for (let index = 0; index < remaining.length; index += 1) {
    const { error: reorderError } = await supabase.from("task_stages").update({ position: index }).eq("key", remaining[index].key);
    if (reorderError) return { error: reorderError.message };
  }

  revalidatePath("/tasks");
  revalidatePath("/");
  return { ok: true };
}

export async function deleteTask(id: string): Promise<Result> {
  const supabase = await db();
  const { error } = await supabase
    .from("tasks")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/tasks");
  revalidatePath("/");
  return { ok: true };
}
