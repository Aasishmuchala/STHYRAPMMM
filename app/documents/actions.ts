"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

type Result = { ok: true } | { error: string };

/* eslint-disable @typescript-eslint/no-explicit-any */
async function db(): Promise<SupabaseClient<any, any, any>> {
  return (await createClient()) as unknown as SupabaseClient<any, any, any>;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function done(): Result {
  revalidatePath("/documents");
  revalidatePath("/");
  return { ok: true };
}

export async function createDocument(i: {
  division_id: string; title: string; doc_type: string | null;
  status: string; body_md: string | null; storage_path: string | null;
}): Promise<Result> {
  const supabase = await db();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  if (!i.title.trim()) return { error: "Title is required" };
  if (!i.division_id) return { error: "Pick a division" };
  const { error } = await supabase.from("documents").insert({
    division_id: i.division_id, title: i.title.trim(), doc_type: i.doc_type,
    status: i.status, body_md: i.body_md, storage_path: i.storage_path, created_by: user.id,
  });
  if (error) return { error: error.message };
  return done();
}

export async function updateDocument(id: string, patch: {
  title?: string; doc_type?: string | null; body_md?: string | null; status?: string;
}): Promise<Result> {
  const supabase = await db();
  const clean = Object.fromEntries(
    Object.entries({ ...patch, updated_at: new Date().toISOString() }).filter(([, v]) => v !== undefined)
  );
  const { error } = await supabase.from("documents").update(clean).eq("id", id);
  if (error) return { error: error.message };
  return done();
}

export async function deleteDocument(id: string, storagePath: string | null): Promise<Result> {
  const supabase = await db();
  if (storagePath && !storagePath.startsWith("http")) {
    await supabase.storage.from("documents").remove([storagePath]);
  }
  const { error } = await supabase.from("documents").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) return { error: error.message };
  return done();
}
