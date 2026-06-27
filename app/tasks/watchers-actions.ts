"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { LooseSupabase as DB } from "@/lib/supabase/loose-client";
type Result = { ok: true } | { error: string };

async function db(): Promise<DB> {
  return (await createClient()) as unknown as DB;
}

export async function watchTask(taskId: string): Promise<Result> {
  const supabase = await db();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  const { error } = await supabase.from("task_watchers").insert({
    task_id: taskId,
    user_id: user.id,
  });
  if (error && !error.message.includes("duplicate")) return { error: error.message };
  revalidatePath("/tasks");
  return { ok: true };
}

export async function unwatchTask(taskId: string): Promise<Result> {
  const supabase = await db();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  const { error } = await supabase
    .from("task_watchers")
    .delete()
    .eq("task_id", taskId)
    .eq("user_id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/tasks");
  return { ok: true };
}