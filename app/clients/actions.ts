"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

/* eslint-disable @typescript-eslint/no-explicit-any */
type DB = SupabaseClient<any, any, any>;
async function db(): Promise<DB> {
  return (await createClient()) as unknown as DB;
}

const STAGES = ["lead", "contacted", "proposal", "won", "lost"];

type Result = { ok: true } | { error: string };

export async function addClient(input: {
  division_id: string; name: string; contact_name?: string; email?: string; phone?: string;
  stage?: string; value_paise?: number; note?: string;
}): Promise<Result> {
  const supabase = await db();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  if (!input.name?.trim()) return { error: "Name is required." };
  if (!input.division_id) return { error: "Pick a division." };
  const { error } = await supabase.from("clients").insert({
    division_id: input.division_id,
    name: input.name.trim().slice(0, 200),
    contact_name: input.contact_name?.trim() || null,
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,
    stage: STAGES.includes(input.stage ?? "") ? input.stage : "lead",
    value_paise: Math.max(0, Math.round(input.value_paise ?? 0)),
    note: input.note?.trim() || null,
    created_by: user.id,
  });
  if (error) return { error: error.message };
  revalidatePath("/clients");
  revalidatePath("/");
  return { ok: true };
}

export async function setClientStage(id: string, stage: string): Promise<Result> {
  if (!STAGES.includes(stage)) return { error: "Invalid stage." };
  const supabase = await db();
  const { error } = await supabase.from("clients").update({ stage, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/clients");
  return { ok: true };
}

export async function deleteClient(id: string): Promise<Result> {
  const supabase = await db();
  const { error } = await supabase.from("clients").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/clients");
  return { ok: true };
}
