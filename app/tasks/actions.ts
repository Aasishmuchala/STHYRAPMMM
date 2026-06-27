"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createHmac } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  canAccessWorkspaceDivision,
  canManageDivision,
  loadUserWorkspaceAccess,
} from "@/lib/server-access";
import { createClient as createAuthClient } from "@supabase/supabase-js";
import type {
  CycleOpt,
  ModuleOpt,
  TaskInput,
  TaskStage,
  TaskStatus,
} from "@/lib/tasks-types";

type Result = { ok: true } | { error: string };
type WorkflowResult<T = void> = T extends void ? Result : { ok: true; data: T } | { error: string };
type WorkflowRow = { id: string; name: string; project_id: string | null; scope_key: string | null };
type StageRow = TaskStage;
type CycleRow = CycleOpt;
type ModuleRow = ModuleOpt;
type StageResult = { ok: true; data: StageRow } | { error: string };
type StageListResult = { ok: true; data: StageRow[] } | { error: string };
type OptionalCycleResult = { ok: true; data: CycleRow | null } | { error: string };
type OptionalModuleResult = { ok: true; data: ModuleRow | null } | { error: string };
type ModuleLeadJoin = { full_name: string | null } | { full_name: string | null }[] | null;

const DELETE_APPROVAL_COOKIE = "sthyra_task_stage_delete_approval";

// The trimmed generated DB types confuse supabase-js into typing insert/update payloads as
// `never`. Mutations are still fully enforced by RLS at runtime; use a loose client here.
/* eslint-disable @typescript-eslint/no-explicit-any */
async function db(): Promise<SupabaseClient<any, any, any>> {
  return (await createClient()) as unknown as SupabaseClient<any, any, any>;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function clean<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

function unwrapLeadName(value: ModuleLeadJoin) {
  if (!value) return null;
  return Array.isArray(value) ? value[0]?.full_name ?? null : value.full_name ?? null;
}

async function currentUser() {
  const supabase = await db();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

async function canManageWorkflow(supabase: SupabaseClient<any, any, any>, userId: string, projectId: string | null): Promise<boolean> {
  if (!projectId) return false;

  const { data: project } = await supabase.from("projects").select("division_id").eq("id", projectId).maybeSingle<{ division_id: string }>();
  if (!project?.division_id) return false;
  const { access } = await loadUserWorkspaceAccess(supabase, userId);
  return canManageDivision(access, project.division_id);
}

async function resolveWorkflow(supabase: SupabaseClient<any, any, any>, projectId: string | null) {
  const query = projectId
    ? supabase.from("task_workflows").select("id,name,project_id,scope_key").eq("project_id", projectId).maybeSingle<WorkflowRow>()
    : supabase.from("task_workflows").select("id,name,project_id,scope_key").eq("scope_key", "general").maybeSingle<WorkflowRow>();
  const { data, error } = await query;
  if (error) return { error: error.message } as const;
  if (!data) return { error: "This project does not have a workflow yet." } as const;
  return { ok: true, data } as const;
}

async function requireProjectCycle(
  supabase: SupabaseClient<any, any, any>,
  projectId: string | null,
  cycleId: string | null | undefined
): Promise<OptionalCycleResult> {
  if (!cycleId) return { ok: true, data: null };
  if (!projectId) return { error: "Pick a project before assigning a cycle." };

  const { data, error } = await supabase
    .from("project_cycles")
    .select("id,project_id,name,goal,starts_on,ends_on,status")
    .eq("id", cycleId)
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .maybeSingle<CycleRow>();
  if (error) return { error: error.message };
  if (!data) return { error: "That cycle is not available for this project." };
  return { ok: true, data };
}

async function requireProjectModule(
  supabase: SupabaseClient<any, any, any>,
  projectId: string | null,
  moduleId: string | null | undefined
): Promise<OptionalModuleResult> {
  if (!moduleId) return { ok: true, data: null };
  if (!projectId) return { error: "Pick a project before assigning a module." };

  const { data, error } = await supabase
    .from("project_modules")
    .select("id,project_id,name,description,color,status,lead_id,lead_name:profiles!project_modules_lead_id_fkey(full_name)")
    .eq("id", moduleId)
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "That module is not available for this project." };

  const row = data as {
    id: string;
    project_id: string;
    name: string;
    description: string | null;
    color: string;
    status: ModuleRow["status"];
    lead_id: string | null;
    lead_name: ModuleLeadJoin;
  };
  return {
    ok: true,
    data: {
      id: row.id,
      project_id: row.project_id,
      name: row.name,
      description: row.description,
      color: row.color,
      status: row.status,
      lead_id: row.lead_id,
      lead_name: unwrapLeadName(row.lead_name),
    },
  };
}

async function requireParentTask(
  supabase: SupabaseClient<any, any, any>,
  projectId: string | null,
  parentTaskId: string | null | undefined
) {
  if (!parentTaskId) return { ok: true, data: null } as const;
  if (!projectId) return { error: "Pick a project before linking an epic." } as const;

  const { data, error } = await supabase
    .from("tasks")
    .select("id,title,project_id,item_type")
    .eq("id", parentTaskId)
    .is("deleted_at", null)
    .maybeSingle<{ id: string; title: string; project_id: string | null; item_type: string | null }>();
  if (error) return { error: error.message } as const;
  if (!data) return { error: "That parent work item no longer exists." } as const;
  if (data.project_id !== projectId) return { error: "Parent work items must belong to the same project." } as const;
  if (data.item_type !== "epic") return { error: "Only epics can be used as parent work items." } as const;
  return { ok: true, data } as const;
}

async function listWorkflowStages(supabase: SupabaseClient<any, any, any>, workflowId: string): Promise<StageListResult> {
  const { data, error } = await supabase
    .from("workflow_stages")
    .select("id,workflow_id,key,label,color,position,is_done")
    .eq("workflow_id", workflowId)
    .order("position")
    .returns<StageRow[]>();
  if (error) return { error: error.message } as const;
  return { ok: true, data: data ?? [] } as const;
}

async function persistWorkflowStagePositions(
  supabase: SupabaseClient<any, any, any>,
  workflowId: string,
  orderedStageIds: string[]
): Promise<Result> {
  if (orderedStageIds.length === 0) return { ok: true };

  // Atomic reorder via the RPC added in migration 20260628. The previous
  // implementation used two non-atomic passes that could leave the workflow
  // half-updated if the network dropped mid-loop (audit H17).
  const { error } = await supabase.rpc("reorder_workflow_stages", {
    workflow_id_param: workflowId,
    ordered_stage_ids: orderedStageIds,
  });
  if (error) return { error: error.message };
  return { ok: true };
}

async function getFirstWorkflowStage(supabase: SupabaseClient<any, any, any>, workflowId: string): Promise<StageResult> {
  const stages = await listWorkflowStages(supabase, workflowId);
  if ("error" in stages) return stages;
  const first = stages.data[0];
  if (!first) return { error: "This workflow has no stages yet." } as const;
  return { ok: true, data: first } as const;
}

async function requireWorkflowStage(supabase: SupabaseClient<any, any, any>, workflowId: string, stageId: string | null | undefined): Promise<StageResult> {
  if (!stageId) return { error: "Pick a workflow stage." } as const;
  const { data, error } = await supabase
    .from("workflow_stages")
    .select("id,workflow_id,key,label,color,position,is_done")
    .eq("id", stageId)
    .eq("workflow_id", workflowId)
    .maybeSingle();
  if (error) return { error: error.message } as const;
  const stage = (data ?? null) as StageRow | null;
  if (!stage) return { error: "That workflow stage no longer exists for this project." } as const;
  return { ok: true, data: stage } as const;
}

async function resolveStageForWorkflow(
  supabase: SupabaseClient<any, any, any>,
  workflowId: string,
  preferredStageId: string | null | undefined
): Promise<StageResult> {
  const preferred = await requireWorkflowStage(supabase, workflowId, preferredStageId);
  if (!("error" in preferred)) return preferred;
  return getFirstWorkflowStage(supabase, workflowId);
}

function slugifyStage(label: string) {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

// Whitelist of allowed stage colors. CSS custom properties + literal hex are
// both allowed. Anything else (e.g. `red; background: url(...)`) is rejected
// to prevent CSS injection (audit 1.5).
const ALLOWED_STAGE_COLOR_RE = /^(#[0-9a-fA-F]{3,8}|var\(--[a-z0-9-]+\))$/;
function sanitizeStageColor(color: string | null | undefined): string | null {
  if (!color) return null;
  const trimmed = color.trim();
  if (!ALLOWED_STAGE_COLOR_RE.test(trimmed)) return null;
  return trimmed;
}

function deletionApprovalSecret(): string {
  // Use the service role key as the HMAC secret so the cookie can't be forged
  // from public values. Throws if not configured — no insecure fallback.
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
    || process.env.STAGE_DELETION_SECRET?.trim();
  if (!secret) {
    throw new Error("Stage deletion approval is not configured. Set SUPABASE_SERVICE_ROLE_KEY or STAGE_DELETION_SECRET.");
  }
  return secret;
}

function signDeletionApproval(userId: string) {
  return createHmac("sha256", deletionApprovalSecret()).update(userId).digest("hex");
}

async function hasDeletionApproval(userId: string) {
  const cookieStore = await cookies();
  const value = cookieStore.get(DELETE_APPROVAL_COOKIE)?.value;
  if (!value) return false;
  const [cookieUserId, signature] = value.split(".");
  return cookieUserId === userId && signature === signDeletionApproval(userId);
}

async function setDeletionApproval(userId: string) {
  const cookieStore = await cookies();
  cookieStore.set(DELETE_APPROVAL_COOKIE, `${userId}.${signDeletionApproval(userId)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
}

async function passwordMatchesCurrentUser(email: string, password: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) return { error: "Supabase auth is not configured." } as const;

  const authClient = createAuthClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await authClient.auth.signInWithPassword({ email, password });
  if (error) return { error: "That password is incorrect." } as const;
  await authClient.auth.signOut();
  return { ok: true } as const;
}

function touchTaskPaths(projectId?: string | null) {
  revalidatePath("/tasks");
  revalidatePath("/");
  revalidatePath("/projects");
  if (projectId) revalidatePath(`/tasks?project=${projectId}`);
}

async function loadProjectDivisionId(
  supabase: SupabaseClient<any, any, any>,
  projectId: string | null | undefined
): Promise<{ ok: true; divisionId: string | null } | { ok: false; error: string }> {
  if (!projectId) return { ok: true, divisionId: null };
  const { data: project, error } = await supabase
    .from("projects")
    .select("division_id")
    .eq("id", projectId)
    .is("deleted_at", null)
    .maybeSingle<{ division_id: string }>();
  if (error) return { ok: false, error: error.message };
  if (!project) return { ok: false, error: "Project not found." };
  return { ok: true, divisionId: project.division_id };
}

export async function createTask(input: TaskInput): Promise<Result> {
  const { supabase, user } = await currentUser();
  if (!user) return { error: "Not authenticated" };
  if (!input.title.trim()) return { error: "Title is required" };
  if (!input.division_id) return { error: "Pick a division" };
  const { access } = await loadUserWorkspaceAccess(supabase, user.id);
  if (!canAccessWorkspaceDivision(access, input.division_id)) {
    return { error: "You don't have access to create work in this company." };
  }

  const projectDivision = await loadProjectDivisionId(supabase, input.project_id);
  if (!projectDivision.ok) return { error: projectDivision.error };
  if (projectDivision.divisionId && projectDivision.divisionId !== input.division_id) {
    return { error: "Pick a project that belongs to the same company." };
  }

  const workflow = await resolveWorkflow(supabase, input.project_id);
  if ("error" in workflow) return { error: workflow.error || "Couldn't load this workflow." };

  const stage = await resolveStageForWorkflow(supabase, workflow.data.id, input.status);
  if ("error" in stage) return stage;
  const cycle = await requireProjectCycle(supabase, input.project_id, input.cycle_id);
  if ("error" in cycle) return cycle;
  const moduleEntry = await requireProjectModule(supabase, input.project_id, input.module_id);
  if ("error" in moduleEntry) return moduleEntry;
  const parentTask = input.item_type === "epic"
    ? { ok: true, data: null as null }
    : await requireParentTask(supabase, input.project_id, input.parent_task_id);
  if ("error" in parentTask) return parentTask;

  const { error } = await supabase.from("tasks").insert({
    title: input.title.trim(),
    division_id: input.division_id,
    project_id: input.project_id,
    assignee_id: input.assignee_id,
    cycle_id: cycle.data?.id ?? null,
    module_id: moduleEntry.data?.id ?? null,
    parent_task_id: parentTask.data?.id ?? null,
    item_type: input.item_type,
    priority: input.priority,
    status_key: stage.data.key,
    workflow_stage_id: stage.data.id,
    due_date: input.due_date,
    description: input.description,
    created_by: user.id,
  });
  if (error) return { error: error.message };

  touchTaskPaths(input.project_id);
  return { ok: true };
}

export async function updateTask(id: string, input: Partial<TaskInput>): Promise<Result> {
  const { supabase, user } = await currentUser();
  if (!user) return { error: "Not authenticated" };
  const { access } = await loadUserWorkspaceAccess(supabase, user.id);
  const { data: existing, error: existingError } = await supabase
    .from("tasks")
    .select("division_id,project_id,workflow_stage_id,item_type")
    .eq("id", id)
    .maybeSingle<{ division_id: string; project_id: string | null; workflow_stage_id: string | null; item_type: string | null }>();
  if (existingError) return { error: existingError.message };
  if (!existing) return { error: "Task not found." };
  if (!canManageDivision(access, existing.division_id)) {
    return { error: "Only the super admin, company owner, or lead can edit this work item." };
  }

  const nextProjectId = input.project_id !== undefined ? input.project_id : existing.project_id;
  const nextDivisionId = input.division_id ?? existing.division_id;
  if (!canManageDivision(access, nextDivisionId)) {
    return { error: "You don't have access to move this work item into that company." };
  }
  const projectDivision = await loadProjectDivisionId(supabase, nextProjectId);
  if (!projectDivision.ok) return { error: projectDivision.error };
  if (projectDivision.divisionId && projectDivision.divisionId !== nextDivisionId) {
    return { error: "Pick a project that belongs to the same company." };
  }
  const workflow = await resolveWorkflow(supabase, nextProjectId);
  if ("error" in workflow) return { error: workflow.error || "Couldn't load this workflow." };

  const desiredStageId = input.status ?? existing.workflow_stage_id;
  const stage = await resolveStageForWorkflow(supabase, workflow.data.id, desiredStageId);
  if ("error" in stage) return stage;
  const nextItemType = input.item_type ?? (existing.item_type === "epic" || existing.item_type === "story" || existing.item_type === "task" || existing.item_type === "bug" || existing.item_type === "improvement" || existing.item_type === "subtask" ? existing.item_type : "task");
  if (input.parent_task_id === id) return { error: "A work item cannot be its own parent epic." };
  const cycle = await requireProjectCycle(supabase, nextProjectId, input.cycle_id);
  if ("error" in cycle) return cycle;
  const moduleEntry = await requireProjectModule(supabase, nextProjectId, input.module_id);
  if ("error" in moduleEntry) return moduleEntry;
  const parentTask = nextItemType === "epic"
    ? { ok: true, data: null as null }
    : await requireParentTask(supabase, nextProjectId, input.parent_task_id);
  if ("error" in parentTask) return parentTask;

  const patch = clean({
    title: input.title?.trim(),
    division_id: input.division_id,
    project_id: input.project_id,
    assignee_id: input.assignee_id,
    cycle_id: input.cycle_id !== undefined ? cycle.data?.id ?? null : undefined,
    module_id: input.module_id !== undefined ? moduleEntry.data?.id ?? null : undefined,
    parent_task_id: input.parent_task_id !== undefined || nextItemType === "epic" ? parentTask.data?.id ?? null : undefined,
    item_type: input.item_type,
    priority: input.priority,
    due_date: input.due_date,
    description: input.description,
    status_key: stage.data.key,
    workflow_stage_id: stage.data.id,
  });

  const { error } = await supabase.from("tasks").update(patch).eq("id", id);
  if (error) return { error: error.message };

  touchTaskPaths(nextProjectId);
  return { ok: true };
}

export async function setTaskStatus(id: string, status: TaskStatus): Promise<Result> {
  const { supabase, user } = await currentUser();
  if (!user) return { error: "Not authenticated" };
  const { access } = await loadUserWorkspaceAccess(supabase, user.id);
  const { data: task, error: taskError } = await supabase
    .from("tasks")
    .select("division_id,project_id,assignee_id")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle<{ division_id: string; project_id: string | null; assignee_id: string | null }>();
  if (taskError) return { error: taskError.message };
  if (!task) return { error: "Task not found." };
  const canManage = canManageDivision(access, task.division_id);
  if (!canManage && task.assignee_id !== user.id) {
    return { error: "You can only move work items assigned to you." };
  }

  const workflow = await resolveWorkflow(supabase, task.project_id);
  if ("error" in workflow) return { error: workflow.error || "Couldn't load this workflow." };
  const stage = await requireWorkflowStage(supabase, workflow.data.id, status);
  if ("error" in stage) return stage;

  const { error } = await supabase
    .from("tasks")
    .update({ workflow_stage_id: stage.data.id, status_key: stage.data.key })
    .eq("id", id)
    .is("deleted_at", null);
  if (error) return { error: error.message };

  touchTaskPaths(task.project_id);
  return { ok: true };
}

export async function createTaskStage(input: {
  project_id: string | null;
  label: string;
  color: string;
  is_done?: boolean;
  after_stage_id?: string | null;
}): Promise<WorkflowResult<TaskStage>> {
  const { supabase, user } = await currentUser();
  if (!user) return { error: "Not authenticated" };
  if (!(await canManageWorkflow(supabase, user.id, input.project_id))) return { error: "Only the owner or this division's lead can edit the workflow." };

  const workflow = await resolveWorkflow(supabase, input.project_id);
  if ("error" in workflow) return { error: workflow.error || "Couldn't load this workflow." };

  const label = input.label.trim();
  if (!label) return { error: "Stage name is required." };

  const safeColor = sanitizeStageColor(input.color) ?? "var(--accent)";

  const baseKey = slugifyStage(label);
  if (!baseKey) return { error: "Use letters or numbers in the stage name." };

  const stages = await listWorkflowStages(supabase, workflow.data.id);
  if ("error" in stages) return stages;

  let key = baseKey;
  let suffix = 2;
  const keySet = new Set(stages.data.map((stage) => stage.key));
  while (keySet.has(key)) {
    key = `${baseKey}_${suffix}`;
    suffix += 1;
  }

  const insertAfter = input.after_stage_id ? stages.data.findIndex((stage) => stage.id === input.after_stage_id) : stages.data.length - 1;
  const insertAt = insertAfter >= 0 ? insertAfter + 1 : stages.data.length;

  const { data, error } = await supabase
    .from("workflow_stages")
    .insert({
      workflow_id: workflow.data.id,
      key,
      label,
      color: safeColor,
      position: stages.data.length + 1000,
      is_done: Boolean(input.is_done),
    })
    .select("id,workflow_id,key,label,color,position,is_done")
    .single();
  if (error) return { error: error.message };

  const orderedStageIds = stages.data.map((stage) => stage.id);
  orderedStageIds.splice(Math.max(0, Math.min(insertAt, orderedStageIds.length)), 0, (data as StageRow).id);
  const reorderResult = await persistWorkflowStagePositions(supabase, workflow.data.id, orderedStageIds);
  if ("error" in reorderResult) return reorderResult;

  touchTaskPaths(input.project_id);
  return { ok: true, data: data as StageRow };
}

export async function updateTaskStage(
  projectId: string | null,
  stageId: string,
  input: Pick<TaskStage, "label" | "color" | "is_done">
): Promise<Result> {
  const { supabase, user } = await currentUser();
  if (!user) return { error: "Not authenticated" };
  if (!(await canManageWorkflow(supabase, user.id, projectId))) return { error: "Only the owner or this division's lead can edit the workflow." };

  const workflow = await resolveWorkflow(supabase, projectId);
  if ("error" in workflow) return { error: workflow.error || "Couldn't load this workflow." };
  const stage = await requireWorkflowStage(supabase, workflow.data.id, stageId);
  if ("error" in stage) return stage;
  if (!input.label.trim()) return { error: "Stage name is required." };

  const safeColor = sanitizeStageColor(input.color);
  if (input.color && !safeColor) {
    return { error: "Stage color must be a hex code (e.g. #6b7280) or a CSS variable." };
  }

  const { error } = await supabase
    .from("workflow_stages")
    .update({
      label: input.label.trim(),
      ...(safeColor ? { color: safeColor } : {}),
      is_done: input.is_done,
    })
    .eq("id", stage.data.id);
  if (error) return { error: error.message };

  touchTaskPaths(projectId);
  return { ok: true };
}

export async function reorderTaskStages(projectId: string | null, stageIds: string[]): Promise<Result> {
  const { supabase, user } = await currentUser();
  if (!user) return { error: "Not authenticated" };
  if (!(await canManageWorkflow(supabase, user.id, projectId))) return { error: "Only the owner or this division's lead can edit the workflow." };
  if (stageIds.length === 0) return { error: "No stages to reorder." };

  const workflow = await resolveWorkflow(supabase, projectId);
  if ("error" in workflow) return { error: workflow.error || "Couldn't load this workflow." };

  const stages = await listWorkflowStages(supabase, workflow.data.id);
  if ("error" in stages) return stages;
  if (stages.data.length !== stageIds.length) {
    return { error: "Refresh the board and try reordering the stages again." };
  }
  const validStageIds = new Set(stages.data.map((stage) => stage.id));
  if (new Set(stageIds).size !== stageIds.length || stageIds.some((stageId) => !validStageIds.has(stageId))) {
    return { error: "Refresh the board and try reordering the stages again." };
  }

  for (let index = 0; index < stageIds.length; index += 1) {
    const stage = await requireWorkflowStage(supabase, workflow.data.id, stageIds[index]);
    if ("error" in stage) return stage;
  }

  const result = await persistWorkflowStagePositions(supabase, workflow.data.id, stageIds);
  if ("error" in result) return result;

  touchTaskPaths(projectId);
  return { ok: true };
}

export async function requestTaskStageDeletionApproval(password: string): Promise<Result> {
  const { supabase, user } = await currentUser();
  if (!user) return { error: "Not authenticated" };
  const { access } = await loadUserWorkspaceAccess(supabase, user.id);
  if (!access.canManageTeams) return { error: "Only the super admin, company owner, or a lead can edit the workflow." };

  const trimmedPassword = password.trim();
  if (!trimmedPassword) return { error: "Enter your account password to continue." };
  if (!user.email) return { error: "Your account email is missing." };

  const passwordCheck = await passwordMatchesCurrentUser(user.email, trimmedPassword);
  if ("error" in passwordCheck) return passwordCheck;

  await setDeletionApproval(user.id);
  return { ok: true };
}

export async function deleteTaskStage(input: {
  project_id: string | null;
  stage_id: string;
  move_tasks_to?: string | null;
}): Promise<Result> {
  const { supabase, user } = await currentUser();
  if (!user) return { error: "Not authenticated" };
  if (!(await canManageWorkflow(supabase, user.id, input.project_id))) return { error: "Only the owner or this division's lead can edit the workflow." };
  if (!(await hasDeletionApproval(user.id))) {
    return { error: "Confirm your password once this session before deleting workflow stages." };
  }

  const workflow = await resolveWorkflow(supabase, input.project_id);
  if ("error" in workflow) return { error: workflow.error || "Couldn't load this workflow." };
  const stage = await requireWorkflowStage(supabase, workflow.data.id, input.stage_id);
  if ("error" in stage) return stage;

  const stages = await listWorkflowStages(supabase, workflow.data.id);
  if ("error" in stages) return stages;
  if (stages.data.length <= 1) return { error: "Your workflow needs at least one stage." };

  const moveTasksTo = input.move_tasks_to?.trim() || null;
  const [{ count }, replacementStage] = await Promise.all([
    supabase.from("tasks").select("id", { head: true, count: "exact" }).eq("workflow_stage_id", stage.data.id).is("deleted_at", null),
    moveTasksTo ? requireWorkflowStage(supabase, workflow.data.id, moveTasksTo) : Promise.resolve({ error: "skip" } as const),
  ]);

  if ((count ?? 0) > 0) {
    if (!moveTasksTo) return { error: `This stage still has ${count} task${count === 1 ? "" : "s"} in it.` };
    if (moveTasksTo === stage.data.id) return { error: "Pick another stage for the remaining tasks." };
    if ("error" in replacementStage) return { error: "Pick a valid destination stage." };

    const { error: moveError } = await supabase
      .from("tasks")
      .update({
        workflow_stage_id: replacementStage.data.id,
        status_key: replacementStage.data.key,
      })
      .eq("workflow_stage_id", stage.data.id)
      .is("deleted_at", null);
    if (moveError) return { error: moveError.message };
  }

  const { error } = await supabase.from("workflow_stages").delete().eq("id", stage.data.id);
  if (error) return { error: error.message };

  const remaining = stages.data.filter((item) => item.id !== stage.data.id);
  const reorderResult = await persistWorkflowStagePositions(supabase, workflow.data.id, remaining.map((item) => item.id));
  if ("error" in reorderResult) return reorderResult;

  touchTaskPaths(input.project_id);
  return { ok: true };
}

export async function deleteTask(id: string): Promise<Result> {
  const { supabase, user } = await currentUser();
  if (!user) return { error: "Not authenticated" };
  const { access } = await loadUserWorkspaceAccess(supabase, user.id);
  const { data: task, error: taskError } = await supabase.from("tasks").select("division_id,project_id").eq("id", id).maybeSingle<{ division_id: string; project_id: string | null }>();
  if (taskError) return { error: taskError.message };
  if (!task) return { error: "Task not found." };
  if (!canManageDivision(access, task.division_id)) {
    return { error: "Only the super admin, company owner, or lead can delete this work item." };
  }

  const { error } = await supabase
    .from("tasks")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };

  touchTaskPaths(task?.project_id ?? null);
  return { ok: true };
}

export async function createProjectCycle(input: {
  project_id: string | null;
  name: string;
  goal?: string | null;
  starts_on?: string | null;
  ends_on?: string | null;
  status?: CycleRow["status"];
}): Promise<WorkflowResult<CycleRow>> {
  const { supabase, user } = await currentUser();
  if (!user) return { error: "Not authenticated" };
  if (!(await canManageWorkflow(supabase, user.id, input.project_id))) return { error: "Only the owner or this division's lead can create cycles." };
  if (!input.project_id) return { error: "Pick a project first." };

  const name = input.name.trim();
  if (!name) return { error: "Cycle name is required." };

  const { data, error } = await supabase
    .from("project_cycles")
    .insert({
      project_id: input.project_id,
      name,
      goal: input.goal?.trim() || null,
      starts_on: input.starts_on || null,
      ends_on: input.ends_on || null,
      status: input.status ?? "planned",
      created_by: user.id,
    })
    .select("id,project_id,name,goal,starts_on,ends_on,status")
    .single<CycleRow>();
  if (error) return { error: error.message };

  touchTaskPaths(input.project_id);
  return { ok: true, data };
}

export async function createProjectModule(input: {
  project_id: string | null;
  name: string;
  description?: string | null;
  color?: string | null;
  lead_id?: string | null;
  status?: ModuleRow["status"];
}): Promise<WorkflowResult<ModuleRow>> {
  const { supabase, user } = await currentUser();
  if (!user) return { error: "Not authenticated" };
  if (!(await canManageWorkflow(supabase, user.id, input.project_id))) return { error: "Only the owner or this division's lead can create modules." };
  if (!input.project_id) return { error: "Pick a project first." };

  const name = input.name.trim();
  if (!name) return { error: "Module name is required." };

  const { data, error } = await supabase
    .from("project_modules")
    .insert({
      project_id: input.project_id,
      name,
      description: input.description?.trim() || null,
      color: input.color?.trim() || "#3b82f6",
      lead_id: input.lead_id || null,
      status: input.status ?? "active",
      created_by: user.id,
    })
    .select("id,project_id,name,description,color,status,lead_id,lead_name:profiles!project_modules_lead_id_fkey(full_name)")
    .single();
  if (error) return { error: error.message };

  const row = data as {
    id: string;
    project_id: string;
    name: string;
    description: string | null;
    color: string;
    status: ModuleRow["status"];
    lead_id: string | null;
    lead_name: ModuleLeadJoin;
  };

  touchTaskPaths(input.project_id);
  return {
    ok: true,
    data: {
      id: row.id,
      project_id: row.project_id,
      name: row.name,
      description: row.description,
      color: row.color,
      status: row.status,
      lead_id: row.lead_id,
      lead_name: unwrapLeadName(row.lead_name),
    },
  };
}

export async function assignTasksToCycle(
  cycleId: string,
  taskIds: string[],
  mode: "add" | "remove" = "add",
): Promise<WorkflowResult<{ updated: number }>> {
  const { supabase, user } = await currentUser();
  if (!user) return { error: "Not authenticated" };
  if (!cycleId) return { error: "Pick a cycle." };
  if (!taskIds.length) return { error: "No tasks selected." };

  const [{ data: cycle, error: cycleErr }, { data: taskRows, error: taskErr }] = await Promise.all([
    supabase
      .from("project_cycles")
      .select("id,project_id")
      .eq("id", cycleId)
      .is("deleted_at", null)
      .maybeSingle<{ id: string; project_id: string }>(),
    supabase
      .from("tasks")
      .select("id,project_id")
      .in("id", taskIds)
      .is("deleted_at", null)
      .returns<{ id: string; project_id: string | null }[]>(),
  ]);
  if (cycleErr) return { error: cycleErr.message };
  if (!cycle) return { error: "Cycle not found." };
  if (taskErr) return { error: taskErr.message };

  if (!(await canManageWorkflow(supabase, user.id, cycle.project_id))) {
    return { error: "Only the owner or this division's lead can manage cycles." };
  }

  const mismatched = (taskRows ?? []).filter((row) => row.project_id !== cycle.project_id);
  if (mismatched.length > 0) {
    return { error: `${mismatched.length} task(s) belong to a different project — they can't go into this cycle.` };
  }

  const update = mode === "remove" ? { cycle_id: null } : { cycle_id: cycleId };
  const { data: updatedRows, error } = await supabase
    .from("tasks")
    .update(update)
    .in("id", taskIds)
    .eq("project_id", cycle.project_id)
    .select("id");

  if (error) return { error: error.message };
  touchTaskPaths(cycle.project_id);
  return { ok: true, data: { updated: updatedRows?.length ?? 0 } };
}

export async function setTaskCycle(taskId: string, cycleId: string | null): Promise<Result> {
  const { supabase, user } = await currentUser();
  if (!user) return { error: "Not authenticated" };

  const { data: task, error: taskErr } = await supabase
    .from("tasks")
    .select("project_id,division_id,assignee_id")
    .eq("id", taskId)
    .is("deleted_at", null)
    .maybeSingle<{ project_id: string | null; division_id: string; assignee_id: string | null }>();
  if (taskErr) return { error: taskErr.message };
  if (!task) return { error: "Task not found." };

  // Auth: managers OR the assignee may change the cycle (including clearing).
  // Previously clearing a cycle (cycleId = null) skipped auth entirely (audit H-set).
  const { access } = await loadUserWorkspaceAccess(supabase, user.id);
  const isManager = canManageDivision(access, task.division_id);
  const isAssignee = task.assignee_id === user.id;
  if (!isManager && !isAssignee) {
    return { error: "Only the assignee or a manager can change the cycle." };
  }

  if (cycleId) {
    const cycleCheck = await requireProjectCycle(supabase, task.project_id, cycleId);
    if ("error" in cycleCheck) return cycleCheck;
    // Only managers may ADD tasks to a cycle (assignees can only clear their own).
    if (!isManager) {
      return { error: "Only a manager can assign this task to a cycle." };
    }
  }

  const { error } = await supabase
    .from("tasks")
    .update({ cycle_id: cycleId || null })
    .eq("id", taskId)
    .is("deleted_at", null);
  if (error) return { error: error.message };
  touchTaskPaths(task.project_id);
  return { ok: true };
}

export async function updateProjectCycle(
  cycleId: string,
  patch: { name?: string; goal?: string | null; starts_on?: string | null; ends_on?: string | null; status?: CycleRow["status"] },
): Promise<Result> {
  const { supabase, user } = await currentUser();
  if (!user) return { error: "Not authenticated" };
  if (!cycleId) return { error: "Cycle id missing." };

  const { data: cycle, error: cycleErr } = await supabase
    .from("project_cycles")
    .select("project_id")
    .eq("id", cycleId)
    .maybeSingle<{ project_id: string }>();
  if (cycleErr) return { error: cycleErr.message };
  if (!cycle) return { error: "Cycle not found." };
  if (!(await canManageWorkflow(supabase, user.id, cycle.project_id))) {
    return { error: "Only the owner or this division's lead can update cycles." };
  }

  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) update.name = patch.name.trim();
  if (patch.goal !== undefined) update.goal = patch.goal?.trim() || null;
  if (patch.starts_on !== undefined) update.starts_on = patch.starts_on || null;
  if (patch.ends_on !== undefined) update.ends_on = patch.ends_on || null;
  if (patch.status !== undefined) update.status = patch.status;
  if (Object.keys(update).length === 0) return { ok: true };

  const { error } = await supabase.from("project_cycles").update(update).eq("id", cycleId);
  if (error) return { error: error.message };
  touchTaskPaths(cycle.project_id);
  return { ok: true };
}

export async function deleteProjectCycle(cycleId: string, reassignTo: string | null = null): Promise<Result> {
  const { supabase, user } = await currentUser();
  if (!user) return { error: "Not authenticated" };
  if (!cycleId) return { error: "Cycle id missing." };

  const { data: cycle, error: cycleErr } = await supabase
    .from("project_cycles")
    .select("project_id")
    .eq("id", cycleId)
    .maybeSingle<{ project_id: string }>();
  if (cycleErr) return { error: cycleErr.message };
  if (!cycle) return { error: "Cycle not found." };
  if (!(await canManageWorkflow(supabase, user.id, cycle.project_id))) {
    return { error: "Only the owner or this division's lead can delete cycles." };
  }

  if (reassignTo) {
    const target = await requireProjectCycle(supabase, cycle.project_id, reassignTo);
    if ("error" in target) return target;
    const { error: moveErr } = await supabase
      .from("tasks")
      .update({ cycle_id: reassignTo })
      .eq("cycle_id", cycleId);
    if (moveErr) return { error: moveErr.message };
  } else {
    const { error: clearErr } = await supabase
      .from("tasks")
      .update({ cycle_id: null })
      .eq("cycle_id", cycleId);
    if (clearErr) return { error: clearErr.message };
  }

  const { error } = await supabase.from("project_cycles").update({ deleted_at: new Date().toISOString() }).eq("id", cycleId);
  if (error) return { error: error.message };
  touchTaskPaths(cycle.project_id);
  return { ok: true };
}
