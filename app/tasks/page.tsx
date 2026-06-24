import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/shell/AppShell";
import { TaskBoard } from "@/components/tasks/TaskBoard";
import { initials } from "@/lib/format";
import { DEFAULT_TASK_STAGES } from "@/lib/tasks-types";
import type { BoardTask, DivisionOpt, ProjectOpt, MemberOpt, TaskPriority, TaskStage, TaskStatus } from "@/lib/tasks-types";

type TaskJoinRow = {
  id: string;
  title: string;
  description: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  due_date: string | null;
  division_id: string;
  project_id: string | null;
  assignee_id: string | null;
  divisions: { name: string; slug: string } | null;
  projects: { name: string } | null;
  assignee: { full_name: string | null } | null;
};

type StageRow = TaskStage;
type WorkflowRow = { id: string; project_id: string | null; scope_key: string | null; name: string };

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ div?: string; project?: string }> }) {
  const sp = await searchParams;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as unknown as SupabaseClient<any, any, any>;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [
    { data: profile },
    { data: memberships },
    { data: divisions },
    { data: projectRows },
    { data: memberRows },
  ] = await Promise.all([
    supabase.from("profiles").select("full_name,email,global_role").eq("id", user.id).maybeSingle(),
    supabase.from("division_members").select("role"),
    supabase.from("divisions").select("id,slug,name").order("slug"),
    supabase.from("projects").select("id,name,division_id").is("deleted_at", null).eq("status", "active").order("name"),
    supabase.from("profiles").select("id,full_name").eq("is_active", true),
  ]);

  const divs: DivisionOpt[] = (divisions ?? []).map((d) => ({ id: d.id, slug: d.slug, name: d.name }));
  const projects: ProjectOpt[] = (projectRows ?? []).map((p) => ({ id: p.id, name: p.name, division_id: p.division_id }));
  const members: MemberOpt[] = (memberRows ?? []).map((m) => ({ id: m.id, name: m.full_name ?? "Unknown" }));

  const selectedProjectId = projects.find((p) => p.id === sp.project)?.id ?? projects[0]?.id ?? null;

  const workflowRes = selectedProjectId
    ? await supabase.from("task_workflows").select("id,project_id,scope_key,name").eq("project_id", selectedProjectId).maybeSingle<WorkflowRow>()
    : { data: null, error: null };
  if (workflowRes.error) {
    throw new Error(workflowRes.error.message);
  }

  const [taskRes, stageRes] = selectedProjectId
    ? await Promise.all([
        supabase
          .from("tasks")
          .select("id,title,description,priority,status:workflow_stage_id,due_date,division_id,project_id,assignee_id,divisions(name,slug),projects(name),assignee:profiles!tasks_assignee_id_fkey(full_name)")
          .eq("project_id", selectedProjectId)
          .is("deleted_at", null)
          .order("due_date", { nullsFirst: false })
          .limit(1000)
          .returns<TaskJoinRow[]>(),
        supabase
          .from("workflow_stages")
          .select("id,workflow_id,key,label,color,position,is_done")
          .eq("workflow_id", workflowRes.data?.id ?? "")
          .order("position")
          .returns<StageRow[]>(),
      ])
    : [{ data: [] as TaskJoinRow[], error: null }, { data: [] as StageRow[], error: null }];

  if (taskRes.error) throw new Error(taskRes.error.message);
  if (stageRes.error) throw new Error(stageRes.error.message);

  const isOwner = profile?.global_role === "owner";
  const canSeeFinances = isOwner || (memberships ?? []).some((m) => m.role === "lead");
  const canManageWorkflow = canSeeFinances;

  const tasks: BoardTask[] = (taskRes.data ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    priority: r.priority,
    status: r.status,
    due_date: r.due_date,
    division_id: r.division_id,
    division_name: r.divisions?.name ?? "",
    division_slug: r.divisions?.slug ?? "",
    project_id: r.project_id,
    project_name: r.projects?.name ?? null,
    assignee_id: r.assignee_id,
    assignee_name: r.assignee?.full_name ?? null,
  }));

  const stages = (stageRes.data?.length ? stageRes.data : DEFAULT_TASK_STAGES).slice().sort((a, b) => a.position - b.position);
  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? null;

  return (
    <AppShell divisions={divs.map((d) => ({ slug: d.slug, name: d.name.replace(/^Sthyra\s+/, "") }))} canSeeFinances={canSeeFinances} isOwner={isOwner} initials={initials(profile?.full_name ?? null, profile?.email ?? null)}>
      <main>
        <header className="subhead">
          <div>
            <div className="label" style={{ marginBottom: 9 }}>Tasks</div>
            <h1>{selectedProject ? selectedProject.name : "Board"}</h1>
            <p className="head-sub">
              {selectedProject
                ? "Switch projects at the top to load that project's board and workflow."
                : "Create a project first, then each project will carry its own workflow."}
            </p>
          </div>
        </header>
        <TaskBoard
          tasks={tasks}
          stages={stages}
          divisions={divs}
          projects={projects}
          members={members}
          currentUserId={user.id}
          canManageWorkflow={canManageWorkflow}
          initialDivision={divs.find((d) => d.slug === sp.div)?.slug}
          activeProjectId={selectedProjectId}
        />
      </main>
    </AppShell>
  );
}
