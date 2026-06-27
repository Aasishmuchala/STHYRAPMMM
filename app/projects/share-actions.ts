"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { canManageProject, loadUserWorkspaceAccess } from "@/lib/server-access";

import type { LooseSupabase as DB } from "@/lib/supabase/loose-client";
type Result<T = void> = T extends void ? { ok: true } | { error: string } : { ok: true; data: T } | { error: string };

async function db(): Promise<DB> {
  return (await createClient()) as unknown as DB;
}

function generateToken(): string {
  return randomBytes(24).toString("base64url");
}

export async function createShareLink(input: {
  projectId: string;
  expiresInDays?: number;
}): Promise<Result<{ token: string; url: string }>> {
  const supabase = await db();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  const { access } = await loadUserWorkspaceAccess(supabase, user.id);
  if (!(await canManageProject(supabase, input.projectId, access))) {
    return { error: "Only project managers can share projects." };
  }
  const token = generateToken();
  const expiresAt = input.expiresInDays
    ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000).toISOString()
    : null;
  const { error } = await supabase.from("share_links").insert({
    project_id: input.projectId,
    token,
    expires_at: expiresAt,
    created_by: user.id,
  });
  if (error) return { error: error.message };
  revalidatePath("/projects");
  return { ok: true, data: { token, url: `/share/${token}` } };
}

export async function revokeShareLink(linkId: string): Promise<Result> {
  const supabase = await db();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  const { error } = await supabase
    .from("share_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", linkId);
  if (error) return { error: error.message };
  revalidatePath("/projects");
  return { ok: true };
}