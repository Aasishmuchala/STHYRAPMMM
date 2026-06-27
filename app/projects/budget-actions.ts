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

export async function setProjectBudget(projectId: string, budgetPaise: number): Promise<Result> {
  const supabase = await db();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  if (!Number.isFinite(budgetPaise) || budgetPaise < 0) return { error: "Budget must be a non-negative number." };
  const { access } = await loadUserWorkspaceAccess(supabase, user.id);
  if (!(await canManageProject(supabase, projectId, access))) {
    return { error: "Only project managers can set a budget." };
  }
  const { error } = await supabase
    .from("projects")
    .update({ budget_paise: Math.floor(budgetPaise) })
    .eq("id", projectId);
  if (error) return { error: error.message };
  revalidatePath("/projects");
  return { ok: true };
}