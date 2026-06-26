"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_TASK_STAGES } from "@/lib/tasks-types";

type Result =
  | { ok: true; promotedLead?: boolean }
  | { error: string; requiresLeadPromotion?: boolean; memberName?: string };
type ProjectTargetResult =
  | { project: { id: string; name: string; division_id: string } }
  | { error: string };

/* eslint-disable @typescript-eslint/no-explicit-any */
async function db(): Promise<SupabaseClient<any, any, any>> {
  return (await createClient()) as unknown as SupabaseClient<any, any, any>;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

async function currentUser() {
  const supabase = await db();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

async function projectAccess(supabase: SupabaseClient<any, any, any>, userId: string, divisionId: string) {
  const { data: profile } = await supabase.from("profiles").select("global_role").eq("id", userId).maybeSingle();
  const isOwner = profile?.global_role === "owner";
  if (isOwner) return { canManage: true, isOwner: true };

  const { data: membership } = await supabase
    .from("division_members")
    .select("id")
    .eq("user_id", userId)
    .eq("division_id", divisionId)
    .eq("role", "lead")
    .maybeSingle();
  return { canManage: Boolean(membership), isOwner: false };
}

async function ensureProjectLead(
  supabase: SupabaseClient<any, any, any>,
  actorIsOwner: boolean,
  divisionId: string,
  leadId: string | null | undefined,
  promoteLead: boolean | undefined
): Promise<Result> {
  if (!leadId) return { ok: true };

  const [{ data: profile }, { data: membership, error: membershipError }] = await Promise.all([
    supabase.from("profiles").select("full_name,email,is_active").eq("id", leadId).maybeSingle<{ full_name: string | null; email: string | null; is_active: boolean | null }>(),
    supabase.from("division_members").select("id,role").eq("user_id", leadId).eq("division_id", divisionId).maybeSingle<{ id: string; role: string }>(),
  ]);

  if (!profile?.is_active) return { error: "Pick an active team member as the project lead." };
  if (membershipError) return { error: membershipError.message };
  const memberName = profile.full_name ?? profile.email ?? "This member";
  if (!membership) {
    if (!actorIsOwner) {
      return { error: "Only the owner can assign someone who is not already part of this division." };
    }
    if (!promoteLead) {
      return {
        error: `${memberName} is not in this division yet. Making them project lead will add them to this division as a lead and broaden their access.`,
        requiresLeadPromotion: true,
        memberName,
      };
    }
    const { error: addMembershipError } = await supabase.from("division_members").insert({
      user_id: leadId,
      division_id: divisionId,
      role: "lead",
    });
    if (addMembershipError) return { error: addMembershipError.message };
    return { ok: true, promotedLead: true };
  }

  if (membership.role === "lead") return { ok: true };
  if (!actorIsOwner) {
    return { error: "Only the owner can promote a member to lead. Pick an existing lead or ask the owner to confirm the promotion." };
  }

  if (!promoteLead) {
    return {
      error: `${memberName} is currently a member. Making them project lead will also promote them to division lead and broaden their access.`,
      requiresLeadPromotion: true,
      memberName,
    };
  }

  const { error: promoteError } = await supabase.from("division_members").update({ role: "lead" }).eq("id", membership.id);
  if (promoteError) return { error: promoteError.message };
  return { ok: true, promotedLead: true };
}

async function loadProjectTarget(
  supabase: SupabaseClient<any, any, any>,
  projectId: string
): Promise<ProjectTargetResult> {
  const { data: project, error } = await supabase
    .from("projects")
    .select("id,name,division_id")
    .eq("id", projectId)
    .is("deleted_at", null)
    .maybeSingle<{ id: string; name: string; division_id: string }>();
  if (error) return { error: error.message };
  if (!project) return { error: "Project not found." };
  return { project };
}

export async function createProjectWithWorkflow(input: {
  name: string;
  division_id: string;
  client?: string | null;
  description?: string | null;
  starts_on?: string | null;
  target_end_on?: string | null;
  lead_id?: string | null;
  promote_lead?: boolean;
}): Promise<Result> {
  const { supabase, user } = await currentUser();
  if (!user) return { error: "Not authenticated" };
  const access = await projectAccess(supabase, user.id, input.division_id);
  if (!access.canManage) return { error: "Only the owner or that division's lead can create projects." };

  const name = input.name.trim();
  if (!name) return { error: "Project name is required." };
  if (!input.division_id) return { error: "Pick a division." };

  const leadResult = await ensureProjectLead(supabase, access.isOwner, input.division_id, input.lead_id, input.promote_lead);
  if ("error" in leadResult) return leadResult;

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .insert({
      name,
      division_id: input.division_id,
      client: input.client?.trim() || null,
      description: input.description?.trim() || null,
      starts_on: input.starts_on || null,
      target_end_on: input.target_end_on || null,
      lead_id: input.lead_id || null,
      status: "active",
      created_by: user.id,
    })
    .select("id")
    .single<{ id: string }>();
  if (projectError) return { error: projectError.message };

  const { data: workflow, error: workflowError } = await supabase
    .from("task_workflows")
    .insert({
      project_id: project.id,
      name: `${name} workflow`,
    })
    .select("id")
    .single<{ id: string }>();
  if (workflowError) return { error: workflowError.message };

  const stageRows = DEFAULT_TASK_STAGES.map((stage, index) => ({
    workflow_id: workflow.id,
    key: stage.key,
    label: stage.label,
    color: stage.color,
    position: index,
    is_done: stage.is_done,
  }));
  const { error: stageError } = await supabase.from("workflow_stages").insert(stageRows);
  if (stageError) return { error: stageError.message };

  revalidatePath("/projects");
  revalidatePath("/tasks");
  return { ok: true, promotedLead: "promotedLead" in leadResult ? leadResult.promotedLead : false };
}

export async function updateProjectDetails(input: {
  project_id: string;
  name: string;
  client?: string | null;
  description?: string | null;
  starts_on?: string | null;
  target_end_on?: string | null;
  lead_id?: string | null;
  promote_lead?: boolean;
}): Promise<Result> {
  const { supabase, user } = await currentUser();
  if (!user) return { error: "Not authenticated" };
  if (!input.project_id) return { error: "Project not found." };

  const target = await loadProjectTarget(supabase, input.project_id);
  if ("error" in target) return target;

  const access = await projectAccess(supabase, user.id, target.project.division_id);
  if (!access.canManage) return { error: "Only the owner or that division's lead can edit this project." };

  const name = input.name.trim();
  if (!name) return { error: "Project name is required." };

  const leadResult = await ensureProjectLead(supabase, access.isOwner, target.project.division_id, input.lead_id, input.promote_lead);
  if ("error" in leadResult) return leadResult;

  const { error } = await supabase
    .from("projects")
    .update({
      name,
      client: input.client?.trim() || null,
      description: input.description?.trim() || null,
      starts_on: input.starts_on || null,
      target_end_on: input.target_end_on || null,
      lead_id: input.lead_id || null,
    })
    .eq("id", input.project_id)
    .is("deleted_at", null);
  if (error) return { error: error.message };

  revalidatePath("/projects");
  revalidatePath("/tasks");
  return { ok: true, promotedLead: "promotedLead" in leadResult ? leadResult.promotedLead : false };
}

export async function deleteProject(projectId: string): Promise<Result> {
  const { supabase, user } = await currentUser();
  if (!user) return { error: "Not authenticated" };
  if (!projectId) return { error: "Project not found." };

  const target = await loadProjectTarget(supabase, projectId);
  if ("error" in target) return target;

  const access = await projectAccess(supabase, user.id, target.project.division_id);
  if (!access.canManage) return { error: "Only the owner or that division's lead can delete this project." };

  const deletedAt = new Date().toISOString();
  const [{ error: taskError }, { error: cycleError }, { error: moduleError }, { error: projectError }] = await Promise.all([
    supabase.from("tasks").update({ deleted_at: deletedAt }).eq("project_id", projectId).is("deleted_at", null),
    supabase.from("project_cycles").update({ deleted_at: deletedAt }).eq("project_id", projectId).is("deleted_at", null),
    supabase.from("project_modules").update({ deleted_at: deletedAt }).eq("project_id", projectId).is("deleted_at", null),
    supabase.from("projects").update({ deleted_at: deletedAt }).eq("id", projectId).is("deleted_at", null),
  ]);

  const firstError = taskError ?? cycleError ?? moduleError ?? projectError;
  if (firstError) return { error: firstError.message };

  revalidatePath("/projects");
  revalidatePath("/tasks");
  return { ok: true };
}
