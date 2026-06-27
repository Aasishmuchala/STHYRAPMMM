"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  canAccessWorkspaceDivision,
  canManageDivision,
  loadUserWorkspaceAccess,
} from "@/lib/server-access";

import type { LooseSupabase as DB } from "@/lib/supabase/loose-client";
type Result = { ok: true } | { error: string };

async function db(): Promise<DB> {
  return (await createClient()) as unknown as DB;
}

export async function addComment(taskId: string, bodyMd: string): Promise<Result> {
  const supabase = await db();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  const body = bodyMd.trim();
  if (!body) return { error: "Comment cannot be empty." };
  if (body.length > 20000) return { error: "Comment is too long (20k chars max)." };

  const { data: task } = await supabase
    .from("tasks")
    .select("division_id,assignee_id,deleted_at")
    .eq("id", taskId)
    .is("deleted_at", null)
    .maybeSingle<{ division_id: string; assignee_id: string | null }>();
  if (!task) return { error: "Task not found." };

  const { access } = await loadUserWorkspaceAccess(supabase, user.id);
  if (!canAccessWorkspaceDivision(access, task.division_id) && task.assignee_id !== user.id) {
    return { error: "You don't have access to comment on this task." };
  }

  const { error } = await supabase.from("task_comments").insert({
    task_id: taskId,
    author_id: user.id,
    body_md: body,
  });
  if (error) return { error: error.message };

  // Notify watchers + assignee (best-effort, non-blocking)
  await notifyWatchers(supabase, taskId, user.id, task.assignee_id, "comment");
  revalidatePath("/tasks");
  return { ok: true };
}

export async function editComment(commentId: string, bodyMd: string): Promise<Result> {
  const supabase = await db();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  const body = bodyMd.trim();
  if (!body) return { error: "Comment cannot be empty." };
  if (body.length > 20000) return { error: "Comment is too long (20k chars max)." };

  // RLS ensures only the author can edit; this is a defense-in-depth check.
  const { data: existing } = await supabase
    .from("task_comments")
    .select("author_id")
    .eq("id", commentId)
    .is("deleted_at", null)
    .maybeSingle<{ author_id: string }>();
  if (!existing) return { error: "Comment not found." };
  if (existing.author_id !== user.id) return { error: "Only the author can edit a comment." };

  const { error } = await supabase
    .from("task_comments")
    .update({ body_md: body, edited_at: new Date().toISOString() })
    .eq("id", commentId);
  if (error) return { error: error.message };
  revalidatePath("/tasks");
  return { ok: true };
}

export async function deleteComment(commentId: string): Promise<Result> {
  const supabase = await db();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  // Soft delete via deleted_at so threads remain coherent.
  const { error } = await supabase
    .from("task_comments")
    .update({ deleted_at: new Date().toISOString(), body_md: "_deleted_" })
    .eq("id", commentId);
  if (error) return { error: error.message };
  revalidatePath("/tasks");
  return { ok: true };
}

async function notifyWatchers(
  supabase: DB,
  taskId: string,
  actorId: string,
  assigneeId: string | null,
  kind: "comment" | "time" | "watcher" | "link",
): Promise<void> {
  try {
    const { data: watchers } = await supabase
      .from("task_watchers")
      .select("user_id")
      .eq("task_id", taskId);
    const ids = new Set<string>();
    for (const w of watchers ?? []) ids.add((w as { user_id: string }).user_id);
    if (assigneeId) ids.add(assigneeId);
    ids.delete(actorId);
    if (ids.size === 0) return;
    const { data: task } = await supabase
      .from("tasks")
      .select("title")
      .eq("id", taskId)
      .maybeSingle<{ title: string }>();
    const title = task?.title ?? "a task";
    const rows = Array.from(ids).map((userId) => ({
      user_id: userId,
      kind: "task",
      title: `New ${kind} on ${title}`,
      body: null,
      href: `/tasks?focus=${taskId}`,
    }));
    await supabase.from("notifications").insert(rows);
  } catch {
    // notifications are best-effort
  }
}