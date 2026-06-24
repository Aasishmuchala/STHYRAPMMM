import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/shell/AppShell";
import { ProjectsView } from "@/components/projects/ProjectsView";
import { initials } from "@/lib/format";
import type { DivisionOpt } from "@/lib/tasks-types";

type ProjectRow = {
  id: string;
  name: string;
  division_id: string;
  client: string | null;
  divisions: { name: string } | { name: string }[] | null;
};

export default async function ProjectsPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as unknown as SupabaseClient<any, any, any>;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [
    { data: profile },
    { data: memberships },
    { data: divisions },
    { data: projectRows },
    { data: taskRows },
  ] = await Promise.all([
    supabase.from("profiles").select("full_name,email,global_role").eq("id", user.id).maybeSingle(),
    supabase.from("division_members").select("role"),
    supabase.from("divisions").select("id,slug,name").order("slug"),
    supabase.from("projects").select("id,name,division_id,client,divisions(name)").is("deleted_at", null).eq("status", "active").order("name"),
    supabase.from("tasks").select("project_id").is("deleted_at", null),
  ]);

  const isOwner = profile?.global_role === "owner";
  const canSeeFinances = isOwner || (memberships ?? []).some((m) => m.role === "lead");
  const divs: DivisionOpt[] = (divisions ?? []).map((d) => ({ id: d.id, slug: d.slug, name: d.name }));
  const taskCounts = new Map<string, number>();
  for (const row of taskRows ?? []) {
    if (!row.project_id) continue;
    taskCounts.set(row.project_id, (taskCounts.get(row.project_id) ?? 0) + 1);
  }
  const projects = ((projectRows ?? []) as ProjectRow[]).map((project) => {
    const division = Array.isArray(project.divisions) ? project.divisions[0] : project.divisions;
    return {
      id: project.id,
      name: project.name,
      division_id: project.division_id,
      division_name: division?.name?.replace(/^Sthyra\s+/, "") ?? "Division",
      client: project.client ?? null,
      openTasks: taskCounts.get(project.id) ?? 0,
    };
  });

  return (
    <AppShell divisions={divs.map((d) => ({ slug: d.slug, name: d.name.replace(/^Sthyra\s+/, "") }))} canSeeFinances={canSeeFinances} isOwner={isOwner} initials={initials(profile?.full_name ?? null, profile?.email ?? null)}>
      <main>
        <header className="subhead">
          <div>
            <div className="label" style={{ marginBottom: 9 }}>Projects</div>
            <h1>Project hub</h1>
            <p className="head-sub">Create a project here, then open it in Tasks to work inside its own workflow and planning flow.</p>
          </div>
        </header>
        <ProjectsView divisions={divs} projects={projects} />
      </main>
    </AppShell>
  );
}
