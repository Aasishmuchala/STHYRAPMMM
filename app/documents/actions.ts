"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  canAccessWorkspaceDivision,
  canManageDivision,
  loadUserWorkspaceAccess,
} from "@/lib/server-access";

type Result = { ok: true } | { error: string };

import type { LooseSupabase as DB } from "@/lib/supabase/loose-client";

async function db(): Promise<DB> {
  return (await createClient()) as unknown as DB;
}

function done(): Result {
  revalidatePath("/documents");
  revalidatePath("/");
  return { ok: true };
}

const ALLOWED_DOC_STATUS = ["draft", "active", "archived"] as const;

async function currentUserAndAccess(supabase: DB) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { access } = await loadUserWorkspaceAccess(supabase, user.id);
  return { user, access };
}

export async function createDocument(i: {
  division_id: string; title: string; doc_type: string | null;
  status: string; body_md: string | null; storage_path: string | null;
}): Promise<Result> {
  const supabase = await db();
  const ctx = await currentUserAndAccess(supabase);
  if (!ctx) return { error: "Not authenticated" };
  const { user, access } = ctx;
  if (!i.title.trim()) return { error: "Title is required" };
  if (!i.division_id) return { error: "Pick a division" };
  // Workspace-membership gate (RLS is the floor; this prevents cross-division writes).
  if (!canAccessWorkspaceDivision(access, i.division_id)) {
    return { error: "You don't have access to this division." };
  }
  const status = (ALLOWED_DOC_STATUS as readonly string[]).includes(i.status) ? i.status : "draft";

  const { error } = await supabase.from("documents").insert({
    division_id: i.division_id,
    title: i.title.trim().slice(0, 240),
    doc_type: i.doc_type?.trim().slice(0, 40) ?? null,
    status,
    body_md: i.body_md,
    storage_path: i.storage_path,
    created_by: user.id,
  });
  if (error) return { error: error.message };
  return done();
}

export async function updateDocument(id: string, patch: {
  title?: string; doc_type?: string | null; body_md?: string | null; status?: string;
}): Promise<Result> {
  const supabase = await db();
  const ctx = await currentUserAndAccess(supabase);
  if (!ctx) return { error: "Not authenticated" };
  const { access } = ctx;

  // Look up the row to scope the auth check to its division.
  const { data: row, error: rowErr } = await supabase
    .from("documents")
    .select("division_id,storage_path")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle<{ division_id: string; storage_path: string | null }>();
  if (rowErr) return { error: rowErr.message };
  if (!row) return { error: "Document not found." };

  if (!canManageDivision(access, row.division_id)) {
    return { error: "Only leads and owners can edit documents." };
  }

  const clean: Record<string, unknown> = {};
  if (typeof patch.title === "string") clean.title = patch.title.trim().slice(0, 240);
  if (patch.doc_type !== undefined) clean.doc_type = patch.doc_type?.trim().slice(0, 40) ?? null;
  if (patch.body_md !== undefined) clean.body_md = patch.body_md;
  if (typeof patch.status === "string" && (ALLOWED_DOC_STATUS as readonly string[]).includes(patch.status)) {
    clean.status = patch.status;
  }
  clean.updated_at = new Date().toISOString();

  const { error } = await supabase.from("documents").update(clean).eq("id", id);
  if (error) return { error: error.message };
  return done();
}

export async function deleteDocument(id: string, storagePath: string | null): Promise<Result> {
  const supabase = await db();
  const ctx = await currentUserAndAccess(supabase);
  if (!ctx) return { error: "Not authenticated" };
  const { access } = ctx;

  // Look up the row, then verify the path the caller is asking us to delete
  // matches the row's storage_path (audit H23).
  const { data: row, error: rowErr } = await supabase
    .from("documents")
    .select("division_id,storage_path")
    .eq("id", id)
    .maybeSingle<{ division_id: string; storage_path: string | null }>();
  if (rowErr) return { error: rowErr.message };
  if (!row) return { error: "Document not found." };

  if (!canManageDivision(access, row.division_id)) {
    return { error: "Only leads and owners can delete documents." };
  }

  if (storagePath && row.storage_path && storagePath !== row.storage_path) {
    return { error: "Storage path does not match this document." };
  }

  if (storagePath && !storagePath.startsWith("http")) {
    try {
      const { error: storageErr } = await supabase.storage.from("documents").remove([storagePath]);
      if (storageErr) {
        // Soft-delete the row anyway so the user isn't blocked, but surface the error.
        // The orphaned file can be cleaned up by a nightly job.
        return { error: `Removed row, but storage cleanup failed: ${storageErr.message}` };
      }
    } catch (e) {
      return { error: `Storage cleanup failed: ${(e as Error).message}` };
    }
  }
  const { error } = await supabase.from("documents").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) return { error: error.message };
  return done();
}