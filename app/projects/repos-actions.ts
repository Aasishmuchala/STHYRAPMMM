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

const REPO_RE = /^https?:\/\/(github\.com|gitlab\.com)\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?\/?$/;

export async function linkRepo(input: {
  projectId: string;
  repoUrl: string;
  branchPattern?: string;
}): Promise<Result> {
  const supabase = await db();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  const url = input.repoUrl.trim();
  if (!REPO_RE.test(url)) return { error: "Repo URL must be a github.com or gitlab.com URL." };
  const { access } = await loadUserWorkspaceAccess(supabase, user.id);
  if (!(await canManageProject(supabase, input.projectId, access))) {
    return { error: "Only project managers can link repositories." };
  }
  const { error } = await supabase.from("repo_links").insert({
    project_id: input.projectId,
    repo_url: url,
    branch_pattern: input.branchPattern?.trim()?.slice(0, 80) || "main",
  });
  if (error) return { error: error.message };
  revalidatePath("/tasks");
  return { ok: true };
}

export async function unlinkRepo(linkId: string): Promise<Result> {
  const supabase = await db();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  const { error } = await supabase.from("repo_links").delete().eq("id", linkId);
  if (error) return { error: error.message };
  revalidatePath("/tasks");
  return { ok: true };
}