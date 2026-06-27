"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  canManageDivision,
  canManageProject,
  loadUserWorkspaceAccess,
} from "@/lib/server-access";

import type { LooseSupabase as DB } from "@/lib/supabase/loose-client";
type Result = { ok: true; data?: unknown } | { error: string };

async function db(): Promise<DB> {
  return (await createClient()) as unknown as DB;
}

const ALLOWED_CHANNELS = ["slack", "teams", "whatsapp", "github", "generic"] as const;

export async function createWebhook(input: {
  projectId: string | null;
  divisionId: string | null;
  name: string;
  channel: string;
  config: Record<string, unknown>;
  secret?: string | null;
}): Promise<Result> {
  const supabase = await db();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  if (!(ALLOWED_CHANNELS as readonly string[]).includes(input.channel)) {
    return { error: `Invalid channel. Allowed: ${ALLOWED_CHANNELS.join(", ")}` };
  }
  const name = input.name.trim().slice(0, 80);
  if (!name) return { error: "Webhook name is required." };
  const { access } = await loadUserWorkspaceAccess(supabase, user.id);
  if (input.projectId) {
    if (!(await canManageProject(supabase, input.projectId, access))) {
      return { error: "Only project managers can manage webhooks." };
    }
  } else if (input.divisionId) {
    if (!canManageDivision(access, input.divisionId)) {
      return { error: "Only leads/owners can manage webhooks." };
    }
  } else {
    return { error: "Specify a project or division." };
  }
  const { error } = await supabase.from("webhooks").insert({
    project_id: input.projectId,
    division_id: input.divisionId,
    name,
    channel: input.channel,
    config: input.config,
    secret: input.secret ?? null,
    enabled: true,
    created_by: user.id,
  });
  if (error) return { error: error.message };
  revalidatePath("/settings");
  return { ok: true };
}

export async function testWebhook(webhookId: string): Promise<Result> {
  // Send a no-op test payload to the configured URL. The app keeps this
  // best-effort — actual delivery happens via the `automation_rules_evaluate_trigger`
  // in the database (see migration 20260628) for real events.
  const supabase = await db();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  const { data: hook } = await supabase
    .from("webhooks")
    .select("channel,config,secret")
    .eq("id", webhookId)
    .maybeSingle<{ channel: string; config: Record<string, unknown>; secret: string | null }>();
  if (!hook) return { error: "Webhook not found." };
  const url = typeof hook.config.url === "string" ? hook.config.url : null;
  if (!url) return { error: "Webhook config is missing a URL." };
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Sthyra-Channel": hook.channel,
        ...(hook.secret ? { "X-Sthyra-Signature": hook.secret } : {}),
      },
      body: JSON.stringify({ event: "test", sent_by: user.id, sent_at: new Date().toISOString() }),
    });
    if (!res.ok) return { error: `Webhook returned ${res.status}` };
    return { ok: true, data: { status: res.status } };
  } catch (e) {
    return { error: `Webhook delivery failed: ${(e as Error).message}` };
  }
}

export async function deleteWebhook(webhookId: string): Promise<Result> {
  const supabase = await db();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  const { error } = await supabase.from("webhooks").delete().eq("id", webhookId);
  if (error) return { error: error.message };
  revalidatePath("/settings");
  return { ok: true };
}