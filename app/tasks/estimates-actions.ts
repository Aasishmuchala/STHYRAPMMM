"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { LooseSupabase as DB } from "@/lib/supabase/loose-client";
type Result = { ok: true } | { error: string };

async function db(): Promise<DB> {
  return (await createClient()) as unknown as DB;
}

export async function setEstimate(input: {
  taskId: string;
  estimatePoints?: number | null;
  estimateHours?: number | null;
}): Promise<Result> {
  const supabase = await db();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  if (input.estimatePoints !== undefined && input.estimatePoints !== null && (input.estimatePoints < 0 || input.estimatePoints > 9999)) {
    return { error: "Estimate must be between 0 and 9999." };
  }
  if (input.estimateHours !== undefined && input.estimateHours !== null && (input.estimateHours < 0 || input.estimateHours > 99999)) {
    return { error: "Hours must be between 0 and 99999." };
  }

  const { error } = await supabase.from("task_estimates").upsert({
    task_id: input.taskId,
    estimate_points: input.estimatePoints ?? null,
    estimate_hours: input.estimateHours ?? null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "task_id" });
  if (error) return { error: error.message };
  revalidatePath("/tasks");
  return { ok: true };
}