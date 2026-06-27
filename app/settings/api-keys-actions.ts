"use server";

import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadUserWorkspaceAccess } from "@/lib/server-access";

import type { LooseSupabase as DB } from "@/lib/supabase/loose-client";

const ALLOWED_SCOPES = ["read", "write"] as const;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function generatePlaintextToken(): { token: string; prefix: string } {
  const raw = randomBytes(32).toString("base64url");
  const prefix = `sthyra_${raw.slice(0, 8)}`;
  return { token: `${prefix}.${raw.slice(8)}`, prefix };
}

export async function createApiKey(name: string, scopes: string[]): Promise<
  { ok: true; data: { id: string; token: string; prefix: string; name: string; scopes: string[] } } | { error: string }
> {
  const supabase = (await createClient()) as unknown as DB;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  const { access } = await loadUserWorkspaceAccess(supabase, user.id);
  if (!access.isSuperAdmin) return { error: "Only the super admin can create API keys." };

  const trimmed = name.trim().slice(0, 80);
  if (!trimmed) return { error: "Name is required." };
  const validScopes = scopes.filter((s) => (ALLOWED_SCOPES as readonly string[]).includes(s));
  if (validScopes.length === 0) validScopes.push("read");

  const { token, prefix } = generatePlaintextToken();
  const hashed = hashToken(token);

  const { data, error } = await supabase.from("api_keys").insert({
    name: trimmed,
    hashed_token: hashed,
    prefix,
    scopes: validScopes,
    created_by: user.id,
  }).select("id").single<{ id: string }>();
  if (error) return { error: error.message };

  return { ok: true, data: { id: data.id, token, prefix, name: trimmed, scopes: validScopes } };
}

export async function revokeApiKey(id: string): Promise<{ ok: true } | { error: string }> {
  const supabase = (await createClient()) as unknown as DB;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  const { access } = await loadUserWorkspaceAccess(supabase, user.id);
  if (!access.isSuperAdmin) return { error: "Only the super admin can revoke API keys." };
  const { error } = await supabase.from("api_keys").update({ revoked_at: new Date().toISOString() }).eq("id", id);
  if (error) return { error: error.message };
  return { ok: true };
}

export async function lookupApiKey(plaintext: string): Promise<
  { ok: true; data: { userId: string; scopes: string[]; apiKeyId: string } } | { error: string }
> {
  // Service-role only — called from /api/v1/* route handlers via the service-role client.
  const supabase = (await createClient()) as unknown as DB;
  const hashed = hashToken(plaintext);
  const { data, error } = await supabase
    .from("api_keys")
    .select("id,created_by,scopes,revoked_at")
    .eq("hashed_token", hashed)
    .maybeSingle<{ id: string; created_by: string; scopes: string[]; revoked_at: string | null }>();
  if (error) return { error: error.message };
  if (!data || data.revoked_at) return { error: "Invalid API key." };
  // Touch last_used_at (best-effort)
  await supabase.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
  return { ok: true, data: { userId: data.created_by, scopes: data.scopes, apiKeyId: data.id } };
}
