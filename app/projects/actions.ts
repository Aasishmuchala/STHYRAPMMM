"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_TASK_STAGES } from "@/lib/tasks-types";

type Result = { ok: true } | { error: string };

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

export async function createProjectWithWorkflow(input: {
  name: string;
  division_id: string;
  client?: string | null;
}): Promise<Result> {
  const { supabase, user } = await currentUser();
  if (!user) return { error: "Not authenticated" };

  const name = input.name.trim();
  if (!name) return { error: "Project name is required." };
  if (!input.division_id) return { error: "Pick a division." };

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .insert({
      name,
      division_id: input.division_id,
      client: input.client?.trim() || null,
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
  return { ok: true };
}
