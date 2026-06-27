"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  canManageDivision,
  loadUserWorkspaceAccess,
} from "@/lib/server-access";

import type { LooseSupabase as DB } from "@/lib/supabase/loose-client";
type Result = { ok: true } | { error: string };

async function db(): Promise<DB> {
  return (await createClient()) as unknown as DB;
}

export async function createOkr(input: {
  parentOkrId?: string | null;
  divisionId?: string | null;
  title: string;
  description?: string;
  targetMetric?: Record<string, unknown>;
  currentValue?: number;
  period: string;
}): Promise<Result> {
  const supabase = await db();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  const title = input.title.trim().slice(0, 200);
  if (!title) return { error: "Title is required." };
  if (!input.period.trim()) return { error: "Period is required (e.g. 2026-Q1)." };

  const { access } = await loadUserWorkspaceAccess(supabase, user.id);
  if (input.divisionId && !canManageDivision(access, input.divisionId)) {
    return { error: "Only leads/owners can add division-level OKRs." };
  }

  const { error } = await supabase.from("okrs").insert({
    parent_okr_id: input.parentOkrId ?? null,
    division_id: input.divisionId ?? null,
    owner_id: user.id,
    title,
    description: input.description?.trim()?.slice(0, 4000) ?? null,
    target_metric: input.targetMetric ?? {},
    current_value: input.currentValue ?? 0,
    period: input.period.trim().slice(0, 20),
  });
  if (error) return { error: error.message };
  revalidatePath("/roadmap");
  return { ok: true };
}

export async function updateOkrProgress(okrId: string, currentValue: number): Promise<Result> {
  const supabase = await db();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  if (!Number.isFinite(currentValue)) return { error: "Current value must be a number." };
  const { error } = await supabase.from("okrs").update({ current_value: currentValue }).eq("id", okrId);
  if (error) return { error: error.message };
  revalidatePath("/roadmap");
  return { ok: true };
}

export async function deleteOkr(okrId: string): Promise<Result> {
  const supabase = await db();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  const { error } = await supabase.from("okrs").delete().eq("id", okrId);
  if (error) return { error: error.message };
  revalidatePath("/roadmap");
  return { ok: true };
}