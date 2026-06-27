import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/shell/AppShell";
import { TaskBoard } from "@/components/tasks/TaskBoard";
import { buildWorkspaceAccess } from "@/lib/access";
import { PageHeader, Button } from "@/components/ui";
import { initials } from "@/lib/format";
import { DEFAULT_TASK_STAGES } from "@/lib/tasks-types";
import type {
  BoardTask,
  CycleOpt,
  DivisionOpt,
  MemberOpt,
  ModuleOpt,
  ProjectOpt,
  TaskPriority,
  TaskStage,
  TaskStatus,
  WorkItemType,
} from "@/lib/tasks-types";

type TaskJoinRow = {
  id: string;
  title: string;
  description: string | null;
  item_type: WorkItemType;
  priority: TaskPriority;
  status: TaskStatus;
  due_date: string | null;
  division_id: string;
  project_id: string | null;
  assignee_id: string | null;
  created_by: string | null;
  cycle_id: string | null;
  module_id: string | null;
  parent_task_id: string | null;
  divisions: { name: string; slug: string } | null;
  projects: { name: string } | null;
  assignee: { full_name: string | null } | null;
  creator: { full_name: string | null } | null;
  cycle: { name: string | null } | null;
  module: { name: string | null } | null;
};

type StageRow = TaskStage;
type WorkflowRow = { id: string; project_id: string | null; scope_key: string | null; name: string };
type CycleRow = CycleOpt;
type ModuleRow = {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  color: string;
  status: ModuleOpt["status"];
  lead_id: string | null;
  lead: { full_name: string | null } | null;
};

function buildTaskHref(search: { div?: string; project?: string; view?: string; tab?: string; cycle?: string; module?: string; assignee?: string }, patch: Record<string, string | null | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...search, ...patch })) {
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `/tasks?${query}` : "/tasks";
}

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ div?: string; project?: string; view?: string; tab?: string; cycle?: string; module?: string; assignee?: string }> }) {
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
    supabase.from("division_members").select("role,division_id").eq("user_id", user.id),
    supabase.from("divisions").select("id,slug,name").order("slug"),
    supabase.from("projects").select("id,name,division_id").is("deleted_at", null).eq("status", "active").order("name"),
    supabase.from("profiles").select("id,full_name").eq("is_active", true),
  ]);

  const membershipRows = (memberships ?? []) as { role: string; division_id: string }[];
  const access = buildWorkspaceAccess(profile?.global_role, membershipRows);
  const divs: DivisionOpt[] = ((divisions ?? []) as DivisionOpt[]).filter(
    (division) => access.isSuperAdmin || access.workspaceDivisionIds.has(division.id) || access.financeDivisionIds.has(division.id)
  );
  const projects: ProjectOpt[] = ((projectRows ?? []) as ProjectOpt[])
    .filter((p) => access.isSuperAdmin || access.workspaceDivisionIds.has(p.division_id))
    .map((p) => ({ id: p.id, name: p.name, division_id: p.division_id }));
  const members: MemberOpt[] = (memberRows ?? []).map((m) => ({ id: m.id, name: m.full_name ?? "Unknown" }));

  const selectedProjectId = projects.find((p) => p.id === sp.project)?.id ?? projects[0]?.id ?? null;

  const workflowRes = selectedProjectId
    ? await supabase.from("task_workflows").select("id,project_id,scope_key,name").eq("project_id", selectedProjectId).maybeSingle<WorkflowRow>()
    : await supabase.from("task_workflows").select("id,project_id,scope_key,name").eq("scope_key", "general").maybeSingle<WorkflowRow>();
  if (workflowRes.error) {
    throw new Error(workflowRes.error.message);
  }

  const [taskRes, stageRes, cycleRes, moduleRes] = selectedProjectId
    ? await Promise.all([
        supabase
          .from("tasks")
          .select("id,title,description,item_type,priority,status:workflow_stage_id,due_date,division_id,project_id,assignee_id,created_by,cycle_id,module_id,parent_task_id,divisions(name,slug),projects(name),assignee:profiles!tasks_assignee_id_fkey(full_name),creator:profiles!tasks_created_by_fkey(full_name),cycle:project_cycles(name),module:project_modules(name)")
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
        supabase
          .from("project_cycles")
          .select("id,project_id,name,goal,starts_on,ends_on,status")
          .eq("project_id", selectedProjectId)
          .is("deleted_at", null)
          .order("starts_on", { ascending: false, nullsFirst: false })
          .returns<CycleRow[]>(),
        supabase
          .from("project_modules")
          .select("id,project_id,name,description,color,status,lead_id,lead:profiles!project_modules_lead_id_fkey(full_name)")
          .eq("project_id", selectedProjectId)
          .is("deleted_at", null)
          .order("name")
          .returns<ModuleRow[]>(),
      ])
    : await Promise.all([
        supabase
          .from("tasks")
          .select("id,title,description,item_type,priority,status:workflow_stage_id,due_date,division_id,project_id,assignee_id,created_by,cycle_id,module_id,parent_task_id,divisions(name,slug),projects(name),assignee:profiles!tasks_assignee_id_fkey(full_name),creator:profiles!tasks_created_by_fkey(full_name),cycle:project_cycles(name),module:project_modules(name)")
          .is("project_id", null)
          .is("deleted_at", null)
          .order("due_date", { nullsFirst: false })
          .limit(1000)
          .returns<TaskJoinRow[]>(),
        workflowRes.data
          ? supabase
              .from("workflow_stages")
              .select("id,workflow_id,key,label,color,position,is_done")
              .eq("workflow_id", workflowRes.data.id)
              .order("position")
              .returns<StageRow[]>()
          : Promise.resolve({ data: [] as StageRow[], error: null }),
        Promise.resolve({ data: [] as CycleRow[], error: null }),
        Promise.resolve({ data: [] as ModuleRow[], error: null }),
      ]);

  if (taskRes.error) throw new Error(taskRes.error.message);
  if (stageRes.error) throw new Error(stageRes.error.message);
  if (cycleRes.error) throw new Error(cycleRes.error.message);
  if (moduleRes.error) throw new Error(moduleRes.error.message);

  const parentTaskIds = [...new Set((taskRes.data ?? []).map((task) => task.parent_task_id).filter((value): value is string => Boolean(value)))];
  const parentTaskTitles = new Map<string, string>();
  if (parentTaskIds.length > 0) {
    const { data: parentRows, error: parentError } = await supabase
      .from("tasks")
      .select("id,title")
      .in("id", parentTaskIds)
      .is("deleted_at", null)
      .returns<{ id: string; title: string }[]>();
    if (parentError) throw new Error(parentError.message);
    for (const row of parentRows ?? []) {
      parentTaskTitles.set(row.id, row.title);
    }
  }

  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? null;
  const canManageWorkflow = access.isSuperAdmin || (
    selectedProject
      ? access.manageableDivisionIds.has(selectedProject.division_id)
      : false
  );
  const canCreateTasks = access.isSuperAdmin || access.workspaceDivisionIds.size > 0;

  const tasks: BoardTask[] = (taskRes.data ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    item_type: r.item_type,
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
    created_by: r.created_by,
    created_by_name: r.creator?.full_name ?? null,
    cycle_id: r.cycle_id,
    cycle_name: r.cycle?.name ?? null,
    module_id: r.module_id,
    module_name: r.module?.name ?? null,
    parent_task_id: r.parent_task_id,
    parent_task_title: r.parent_task_id ? (parentTaskTitles.get(r.parent_task_id) ?? null) : null,
  }));
  const cycles: CycleOpt[] = cycleRes.data ?? [];
  const modules: ModuleOpt[] = (moduleRes.data ?? []).map((module) => ({
    id: module.id,
    project_id: module.project_id,
    name: module.name,
    description: module.description,
    color: module.color,
    status: module.status,
    lead_id: module.lead_id,
    lead_name: module.lead?.full_name ?? null,
  }));

  const stages = (stageRes.data?.length ? stageRes.data : DEFAULT_TASK_STAGES).slice().sort((a, b) => a.position - b.position);
  const requestedTab = sp.tab === "overview" || sp.tab === "epics" || sp.tab === "cycles" || sp.tab === "modules" ? sp.tab : "work-items";
  const tab = selectedProjectId || requestedTab === "work-items" || requestedTab === "epics" ? requestedTab : "work-items";
  const workItemsHref = buildTaskHref(sp, { tab: "work-items", cycle: null, module: null });
  const epicsHref = buildTaskHref(sp, { tab: "epics", cycle: null, module: null });
  const overviewHref = buildTaskHref(sp, { tab: "overview", cycle: null, module: null });
  const cyclesHref = buildTaskHref(sp, { tab: "cycles", module: null });
  const modulesHref = buildTaskHref(sp, { tab: "modules", cycle: null });
  const epicCount = tasks.filter((task) => task.item_type === "epic").length;
  const boardCount = tasks.filter((task) => task.item_type !== "epic").length;

  return (
    <AppShell divisions={divs.map((d) => ({ slug: d.slug, name: d.name.replace(/^Sthyra\s+/, "") }))} canSeeFinances={access.canSeeFinances} isOwner={access.isSuperAdmin} initials={initials(profile?.full_name ?? null, profile?.email ?? null)}>
      <main className="tasks-main">
        <PageHeader
          eyebrow="Tasks"
          title={selectedProject ? selectedProject.name : "Board"}
          sub={selectedProject
            ? "Use the project switcher below to move between boards, cycles, modules, and workflow."
            : tasks.length > 0
              ? "General work items still show up here even before they are attached to a project."
              : "General work items and assigned tasks will appear here even if a project has not been created yet."}
          breadcrumbs={selectedProject ? [{ label: "Projects", href: "/projects" }, { label: selectedProject.name }] : undefined}
          tabs={selectedProject
            ? [
                { label: "Overview", href: overviewHref, active: tab === "overview" },
                { label: "Work items", href: workItemsHref, active: tab === "work-items", count: boardCount },
                { label: "Epics", href: epicsHref, active: tab === "epics", count: epicCount },
                { label: "Cycles", href: cyclesHref, active: tab === "cycles", count: cycles.length },
                { label: "Modules", href: modulesHref, active: tab === "modules", count: modules.length },
              ]
            : [
                { label: "Work items", href: workItemsHref, active: tab === "work-items", count: boardCount },
                { label: "Epics", href: epicsHref, active: tab === "epics", count: epicCount },
              ]}
          actions={
            <Button href="/projects" variant="ghost">Manage projects</Button>
          }
        />
        <TaskBoard
          tasks={tasks}
          stages={stages}
          divisions={divs}
          projects={projects}
          members={members}
          cycles={cycles}
          modules={modules}
          currentUserId={user.id}
          canManageWorkflow={canManageWorkflow}
          canCreateTasks={canCreateTasks}
          initialDivision={divs.find((d) => d.slug === sp.div)?.slug}
          activeProjectId={selectedProjectId}
          initialView={sp.view === "list" ? "list" : "board"}
          initialTab={tab}
          initialCycleId={sp.cycle ?? null}
          initialModuleId={sp.module ?? null}
          initialAssignee={sp.assignee ?? "all"}
        />
      </main>
    </AppShell>
  );
}
