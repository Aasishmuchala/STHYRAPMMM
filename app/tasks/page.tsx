import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/shell/AppShell";
import { TaskBoard } from "@/components/tasks/TaskBoard";
import { initials } from "@/lib/format";
import type { BoardTask, DivisionOpt, ProjectOpt, MemberOpt, TaskPriority, TaskStatus } from "@/lib/tasks-types";

type TaskJoinRow = {
  id: string; title: string; description: string | null;
  priority: TaskPriority; status: TaskStatus; due_date: string | null;
  division_id: string; project_id: string | null; assignee_id: string | null;
  divisions: { name: string; slug: string } | null;
  projects: { name: string } | null;
  assignee: { full_name: string | null } | null;
};

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ div?: string }> }) {
  const sp = await searchParams;
  // Loose client: the trimmed generated types otherwise infer `never` for selects.
  // Typed reads are restored via `.returns<T>()`; RLS enforces all access at runtime.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as unknown as SupabaseClient<any, any, any>;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [
    { data: profile },
    { data: memberships },
    { data: divisions },
    { data: taskRows },
    { data: projectRows },
    { data: memberRows },
  ] = await Promise.all([
    supabase.from("profiles").select("full_name,email,global_role").eq("id", user.id).maybeSingle(),
    supabase.from("division_members").select("role"),
    supabase.from("divisions").select("id,slug,name").order("slug"),
    supabase.from("tasks").select("id,title,description,priority,status,due_date,division_id,project_id,assignee_id,divisions(name,slug),projects(name),assignee:profiles!tasks_assignee_id_fkey(full_name)").is("deleted_at", null).order("due_date", { nullsFirst: false }).limit(1000).returns<TaskJoinRow[]>(),
    supabase.from("projects").select("id,name,division_id").is("deleted_at", null).eq("status", "active"),
    supabase.from("profiles").select("id,full_name").eq("is_active", true),
  ]);

  const isOwner = profile?.global_role === "owner";
  const canSeeFinances = isOwner || (memberships ?? []).some((m) => m.role === "lead");

  const tasks: BoardTask[] = (taskRows ?? []).map((r) => ({
    id: r.id, title: r.title, description: r.description, priority: r.priority, status: r.status, due_date: r.due_date,
    division_id: r.division_id, division_name: r.divisions?.name ?? "", division_slug: r.divisions?.slug ?? "",
    project_id: r.project_id, project_name: r.projects?.name ?? null,
    assignee_id: r.assignee_id, assignee_name: r.assignee?.full_name ?? null,
  }));
  const divs: DivisionOpt[] = (divisions ?? []).map((d) => ({ id: d.id, slug: d.slug, name: d.name }));
  const projects: ProjectOpt[] = (projectRows ?? []).map((p) => ({ id: p.id, name: p.name, division_id: p.division_id }));
  const members: MemberOpt[] = (memberRows ?? []).map((m) => ({ id: m.id, name: m.full_name ?? "Unknown" }));

  return (
    <AppShell divisions={divs.map((d) => ({ slug: d.slug, name: d.name.replace(/^Sthyra\s+/, "") }))} canSeeFinances={canSeeFinances} isOwner={isOwner} initials={initials(profile?.full_name ?? null, profile?.email ?? null)}>
      <main>
          <header className="subhead">
            <div>
              <div className="label" style={{ marginBottom: 9 }}>Tasks</div>
              <h1>Board</h1>
              <p className="head-sub">Everything that needs doing, across every division. Drag a card to move it along.</p>
            </div>
          </header>
          <TaskBoard tasks={tasks} divisions={divs} projects={projects} members={members} currentUserId={user.id} initialDivision={divs.find((d) => d.slug === sp.div)?.slug} />
        </main>
    </AppShell>
  );
}
