"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  canAccessWorkspaceDivision,
  canManageDivision,
  canManageProject,
  loadUserWorkspaceAccess,
} from "@/lib/server-access";

import type { LooseSupabase as DB } from "@/lib/supabase/loose-client";
type Result = { ok: true } | { error: string };

async function db(): Promise<DB> {
  return (await createClient()) as unknown as DB;
}

const ALLOWED_TRIGGERS = [
  "task_created", "task_updated", "task_status_changed", "task_assigned",
  "task_completed", "invoice_overdue",
] as const;
const ALLOWED_ACTIONS = [
  "set_field", "send_notification", "post_webhook", "add_label", "create_followup_task",
] as const;

async function ensureCanManage(
  supabase: DB,
  userId: string,
  scope: { projectId?: string | null; divisionId?: string | null },
): Promise<Result> {
  const { access } = await loadUserWorkspaceAccess(supabase, userId);
  if (scope.projectId) {
    if (!(await canManageProject(supabase, scope.projectId, access))) {
      return { error: "Only project managers can manage automations." };
    }
  } else if (scope.divisionId) {
    if (!canManageDivision(access, scope.divisionId)) {
      return { error: "Only leads/owners can manage automations." };
    }
  } else if (!access.isSuperAdmin) {
    return { error: "Specify a project or division." };
  }
  return { ok: true };
}

export async function createRule(input: {
  projectId: string | null;
  divisionId: string | null;
  name: string;
  triggerEvent: string;
  action: string;
  conditions?: Record<string, unknown>;
  actionPayload?: Record<string, unknown>;
}): Promise<Result> {
  const supabase = await db();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  if (!(ALLOWED_TRIGGERS as readonly string[]).includes(input.triggerEvent)) {
    return { error: "Invalid trigger." };
  }
  if (!(ALLOWED_ACTIONS as readonly string[]).includes(input.action)) {
    return { error: "Invalid action." };
  }
  const name = input.name.trim().slice(0, 120);
  if (!name) return { error: "Rule name is required." };

  const auth = await ensureCanManage(supabase, user.id, { projectId: input.projectId, divisionId: input.divisionId });
  if ("error" in auth) return auth;

  const { error } = await supabase.from("automation_rules").insert({
    project_id: input.projectId,
    division_id: input.divisionId,
    name,
    trigger_event: input.triggerEvent,
    conditions: input.conditions ?? {},
    action: input.action,
    action_payload: input.actionPayload ?? {},
    enabled: true,
    created_by: user.id,
  });
  if (error) return { error: error.message };
  revalidatePath("/automations");
  return { ok: true };
}

export async function setRuleEnabled(ruleId: string, enabled: boolean): Promise<Result> {
  const supabase = await db();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  const { error } = await supabase.from("automation_rules").update({ enabled }).eq("id", ruleId);
  if (error) return { error: error.message };
  revalidatePath("/automations");
  return { ok: true };
}

export async function deleteRule(ruleId: string): Promise<Result> {
  const supabase = await db();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  const { error } = await supabase.from("automation_rules").delete().eq("id", ruleId);
  if (error) return { error: error.message };
  revalidatePath("/automations");
  return { ok: true };
}

export async function updateRule(ruleId: string, patch: {
  name?: string;
  triggerEvent?: string;
  action?: string;
  conditions?: Record<string, unknown>;
  actionPayload?: Record<string, unknown>;
}): Promise<Result> {
  const supabase = await db();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  const clean: Record<string, unknown> = {};
  if (patch.name !== undefined) clean.name = patch.name.trim().slice(0, 120);
  if (patch.triggerEvent !== undefined) {
    if (!(ALLOWED_TRIGGERS as readonly string[]).includes(patch.triggerEvent)) {
      return { error: "Invalid trigger." };
    }
    clean.trigger_event = patch.triggerEvent;
  }
  if (patch.action !== undefined) {
    if (!(ALLOWED_ACTIONS as readonly string[]).includes(patch.action)) {
      return { error: "Invalid action." };
    }
    clean.action = patch.action;
  }
  if (patch.conditions !== undefined) clean.conditions = patch.conditions;
  if (patch.actionPayload !== undefined) clean.action_payload = patch.actionPayload;
  const { error } = await supabase.from("automation_rules").update(clean).eq("id", ruleId);
  if (error) return { error: error.message };
  revalidatePath("/automations");
  return { ok: true };
}