"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  canAccessWorkspaceDivision,
  loadUserWorkspaceAccess,
} from "@/lib/server-access";
import { parseDuration } from "@/lib/format";

import type { LooseSupabase as DB } from "@/lib/supabase/loose-client";
type Result = { ok: true } | { error: string };

async function db(): Promise<DB> {
  return (await createClient()) as unknown as DB;
}

export async function logTime(input: {
  taskId: string;
  startedAt: string;
  minutes: number | string;
  note?: string;
}): Promise<Result> {
  const supabase = await db();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const minutes = typeof input.minutes === "string" ? parseDuration(input.minutes) : input.minutes;
  if (!Number.isFinite(minutes) || minutes <= 0) return { error: "Enter a positive duration." };
  if (minutes > 24 * 60 * 14) return { error: "A single log entry cannot exceed 14 days." };
  if (!input.startedAt) return { error: "Pick a date." };

  const { data: task } = await supabase
    .from("tasks")
    .select("division_id,assignee_id")
    .eq("id", input.taskId)
    .is("deleted_at", null)
    .maybeSingle<{ division_id: string; assignee_id: string | null }>();
  if (!task) return { error: "Task not found." };

  const { access } = await loadUserWorkspaceAccess(supabase, user.id);
  if (!canAccessWorkspaceDivision(access, task.division_id) && task.assignee_id !== user.id) {
    return { error: "You don't have access to log time on this task." };
  }

  const { error } = await supabase.from("task_work_logs").insert({
    task_id: input.taskId,
    profile_id: user.id,
    started_at: input.startedAt,
    minutes,
    note: input.note?.trim()?.slice(0, 1000) ?? null,
  });
  if (error) return { error: error.message };
  revalidatePath("/tasks");
  revalidatePath("/timesheet");
  return { ok: true };
}

export async function updateTimeLog(logId: string, patch: {
  minutes?: number | string;
  note?: string | null;
  startedAt?: string;
}): Promise<Result> {
  const supabase = await db();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  const clean: Record<string, unknown> = {};
  if (patch.minutes !== undefined) {
    const m = typeof patch.minutes === "string" ? parseDuration(patch.minutes) : patch.minutes;
    if (!Number.isFinite(m) || m < 0 || m > 24 * 60 * 14) return { error: "Invalid duration." };
    clean.minutes = m;
  }
  if (patch.note !== undefined) clean.note = patch.note?.trim()?.slice(0, 1000) ?? null;
  if (patch.startedAt) clean.started_at = patch.startedAt;

  // RLS lets the author edit; this is the same gate the DB enforces.
  const { error } = await supabase.from("task_work_logs").update(clean).eq("id", logId);
  if (error) return { error: error.message };
  revalidatePath("/timesheet");
  return { ok: true };
}

export async function deleteTimeLog(logId: string): Promise<Result> {
  const supabase = await db();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  const { error } = await supabase.from("task_work_logs").delete().eq("id", logId);
  if (error) return { error: error.message };
  revalidatePath("/timesheet");
  return { ok: true };
}