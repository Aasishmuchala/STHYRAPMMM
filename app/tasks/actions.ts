"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createHmac } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient as createAuthClient } from "@supabase/supabase-js";
import type { TaskInput, TaskStage, TaskStatus } from "@/lib/tasks-types";

type Result = { ok: true } | { error: string };
type WorkflowResult<T = void> = T extends void ? Result : { ok: true; data: T } | { error: string };
type WorkflowRow = { id: string; name: string; project_id: string | null; scope_key: string | null };
type StageRow = TaskStage;
type StageResult = { ok: true; data: StageRow } | { error: string };
type StageListResult = { ok: true; data: StageRow[] } | { error: string };

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

async function currentUser() {
  const supabase = await db();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

async function canManageWorkflow(supabase: SupabaseClient<any, any, any>, userId: string): Promise<boolean> {
  const [{ data: profile }, { data: memberships }] = await Promise.all([
    supabase.from("profiles").select("global_role").eq("id", userId).maybeSingle(),
    supabase.from("division_members").select("role").eq("user_id", userId),
  ]);
  return profile?.global_role === "owner" || (memberships ?? []).some((m) => m.role === "lead");
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

function deletionApprovalSecret() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || "sthyra-task-stage-delete";
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

export async function createTask(input: TaskInput): Promise<Result> {
  const { supabase, user } = await currentUser();
  if (!user) return { error: "Not authenticated" };
  if (!input.title.trim()) return { error: "Title is required" };
  if (!input.division_id) return { error: "Pick a division" };

  const workflow = await resolveWorkflow(supabase, input.project_id);
  if ("error" in workflow) return { error: workflow.error || "Couldn't load this workflow." };

  const stage = await resolveStageForWorkflow(supabase, workflow.data.id, input.status);
  if ("error" in stage) return stage;

  const { error } = await supabase.from("tasks").insert({
    title: input.title.trim(),
    division_id: input.division_id,
    project_id: input.project_id,
    assignee_id: input.assignee_id,
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
  const supabase = await db();
  const { data: existing, error: existingError } = await supabase
    .from("tasks")
    .select("project_id,workflow_stage_id")
    .eq("id", id)
    .maybeSingle<{ project_id: string | null; workflow_stage_id: string | null }>();
  if (existingError) return { error: existingError.message };
  if (!existing) return { error: "Task not found." };

  const nextProjectId = input.project_id !== undefined ? input.project_id : existing.project_id;
  const workflow = await resolveWorkflow(supabase, nextProjectId);
  if ("error" in workflow) return { error: workflow.error || "Couldn't load this workflow." };

  const desiredStageId = input.status ?? existing.workflow_stage_id;
  const stage = await resolveStageForWorkflow(supabase, workflow.data.id, desiredStageId);
  if ("error" in stage) return stage;

  const patch = clean({
    title: input.title?.trim(),
    division_id: input.division_id,
    project_id: input.project_id,
    assignee_id: input.assignee_id,
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
  const supabase = await db();
  const { data: task, error: taskError } = await supabase
    .from("tasks")
    .select("project_id")
    .eq("id", id)
    .maybeSingle<{ project_id: string | null }>();
  if (taskError) return { error: taskError.message };
  if (!task) return { error: "Task not found." };

  const workflow = await resolveWorkflow(supabase, task.project_id);
  if ("error" in workflow) return { error: workflow.error || "Couldn't load this workflow." };
  const stage = await requireWorkflowStage(supabase, workflow.data.id, status);
  if ("error" in stage) return stage;

  const { error } = await supabase
    .from("tasks")
    .update({ workflow_stage_id: stage.data.id, status_key: stage.data.key })
    .eq("id", id);
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
  if (!(await canManageWorkflow(supabase, user.id))) return { error: "Only owners and leads can edit the workflow." };

  const workflow = await resolveWorkflow(supabase, input.project_id);
  if ("error" in workflow) return { error: workflow.error || "Couldn't load this workflow." };

  const label = input.label.trim();
  if (!label) return { error: "Stage name is required." };

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

  for (let index = stages.data.length - 1; index >= insertAt; index -= 1) {
    const stage = stages.data[index];
    const { error } = await supabase.from("workflow_stages").update({ position: index + 1 }).eq("id", stage.id);
    if (error) return { error: error.message };
  }

  const { data, error } = await supabase
    .from("workflow_stages")
    .insert({
      workflow_id: workflow.data.id,
      key,
      label,
      color: input.color || "var(--accent)",
      position: Math.max(0, Math.min(insertAt, stages.data.length)),
      is_done: Boolean(input.is_done),
    })
    .select("id,workflow_id,key,label,color,position,is_done")
    .single();
  if (error) return { error: error.message };
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
  if (!(await canManageWorkflow(supabase, user.id))) return { error: "Only owners and leads can edit the workflow." };

  const workflow = await resolveWorkflow(supabase, projectId);
  if ("error" in workflow) return { error: workflow.error || "Couldn't load this workflow." };
  const stage = await requireWorkflowStage(supabase, workflow.data.id, stageId);
  if ("error" in stage) return stage;
  if (!input.label.trim()) return { error: "Stage name is required." };

  const { error } = await supabase
    .from("workflow_stages")
    .update({
      label: input.label.trim(),
      color: input.color,
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
  if (!(await canManageWorkflow(supabase, user.id))) return { error: "Only owners and leads can edit the workflow." };
  if (stageIds.length === 0) return { error: "No stages to reorder." };

  const workflow = await resolveWorkflow(supabase, projectId);
  if ("error" in workflow) return { error: workflow.error || "Couldn't load this workflow." };

  for (let index = 0; index < stageIds.length; index += 1) {
    const stage = await requireWorkflowStage(supabase, workflow.data.id, stageIds[index]);
    if ("error" in stage) return stage;
    const { error } = await supabase.from("workflow_stages").update({ position: index }).eq("id", stageIds[index]);
    if (error) return { error: error.message };
  }

  touchTaskPaths(projectId);
  return { ok: true };
}

export async function requestTaskStageDeletionApproval(password: string): Promise<Result> {
  const { supabase, user } = await currentUser();
  if (!user) return { error: "Not authenticated" };
  if (!(await canManageWorkflow(supabase, user.id))) return { error: "Only owners and leads can edit the workflow." };

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
  if (!(await canManageWorkflow(supabase, user.id))) return { error: "Only owners and leads can edit the workflow." };
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
  for (let index = 0; index < remaining.length; index += 1) {
    const { error: reorderError } = await supabase.from("workflow_stages").update({ position: index }).eq("id", remaining[index].id);
    if (reorderError) return { error: reorderError.message };
  }

  touchTaskPaths(input.project_id);
  return { ok: true };
}

export async function deleteTask(id: string): Promise<Result> {
  const supabase = await db();
  const { data: task, error: taskError } = await supabase.from("tasks").select("project_id").eq("id", id).maybeSingle<{ project_id: string | null }>();
  if (taskError) return { error: taskError.message };

  const { error } = await supabase
    .from("tasks")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };

  touchTaskPaths(task?.project_id ?? null);
  return { ok: true };
}
