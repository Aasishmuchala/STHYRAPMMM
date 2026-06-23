"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TaskInput, TaskStatus } from "@/lib/tasks-types";

type Result = { ok: true } | { error: string };

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

export async function createTask(input: TaskInput): Promise<Result> {
  const supabase = await db();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  if (!input.title.trim()) return { error: "Title is required" };
  if (!input.division_id) return { error: "Pick a division" };

  const { error } = await supabase.from("tasks").insert({
    title: input.title.trim(),
    division_id: input.division_id,
    project_id: input.project_id,
    assignee_id: input.assignee_id,
    priority: input.priority,
    status: input.status,
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
  const patch = clean({
    title: input.title?.trim(),
    division_id: input.division_id,
    project_id: input.project_id,
    assignee_id: input.assignee_id,
    priority: input.priority,
    status: input.status,
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
  const { error } = await supabase.from("tasks").update({ status }).eq("id", id);
  if (error) return { error: error.message };
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
