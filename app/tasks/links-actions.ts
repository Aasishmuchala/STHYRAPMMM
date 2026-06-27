"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { LooseSupabase as DB } from "@/lib/supabase/loose-client";
type Result = { ok: true } | { error: string };

async function db(): Promise<DB> {
  return (await createClient()) as unknown as DB;
}

const ALLOWED_LINK_KINDS = ["blocks", "relates", "duplicates"] as const;

export async function linkTasks(
  srcTaskId: string,
  dstTaskId: string,
  kind: string,
): Promise<Result> {
  const supabase = await db();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  if (srcTaskId === dstTaskId) return { error: "Cannot link a task to itself." };
  if (!(ALLOWED_LINK_KINDS as readonly string[]).includes(kind)) {
    return { error: `Invalid link kind. Allowed: ${ALLOWED_LINK_KINDS.join(", ")}` };
  }

  const { error } = await supabase.from("task_links").insert({
    src_task_id: srcTaskId,
    dst_task_id: dstTaskId,
    kind,
    created_by: user.id,
  });
  if (error && !error.message.includes("duplicate")) return { error: error.message };
  revalidatePath("/tasks");
  return { ok: true };
}

export async function unlinkTasks(linkId: string): Promise<Result> {
  const supabase = await db();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  const { error } = await supabase.from("task_links").delete().eq("id", linkId);
  if (error) return { error: error.message };
  revalidatePath("/tasks");
  return { ok: true };
}