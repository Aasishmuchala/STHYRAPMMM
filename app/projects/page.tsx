import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/shell/AppShell";
import { ProjectsView } from "@/components/projects/ProjectsView";
import { buildWorkspaceAccess } from "@/lib/access";
import { initials } from "@/lib/format";
import type { DivisionOpt } from "@/lib/tasks-types";

type ProjectRow = {
  id: string;
  name: string;
  division_id: string;
  client: string | null;
  description: string | null;
  starts_on: string | null;
  target_end_on: string | null;
  lead_id: string | null;
  lead: { full_name: string | null } | { full_name: string | null }[] | null;
  divisions: { name: string } | { name: string }[] | null;
};
type MemberRow = { id: string; full_name: string | null; email: string | null };
type DivisionMembershipRow = { user_id: string; division_id: string; role: string };

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
    supabase.from("division_members").select("role,division_id").eq("user_id", user.id),
    supabase.from("divisions").select("id,slug,name").order("slug"),
    supabase.from("projects").select("id,name,division_id,client,description,starts_on,target_end_on,lead_id,lead:profiles!projects_lead_id_fkey(full_name),divisions(name)").is("deleted_at", null).eq("status", "active").order("name"),
    supabase.from("tasks").select("project_id").is("deleted_at", null),
  ]);

  const membershipRows = (memberships ?? []) as { role: string; division_id: string }[];
  const access = buildWorkspaceAccess(profile?.global_role, membershipRows);
  const canSeeFinances = access.canSeeFinances;
  const divs: DivisionOpt[] = ((divisions ?? []) as DivisionOpt[]).filter(
    (division) => access.isSuperAdmin || access.workspaceDivisionIds.has(division.id) || access.financeDivisionIds.has(division.id)
  );
  const creatableDivisions = access.isSuperAdmin
    ? divs
    : divs.filter((division) => access.manageableDivisionIds.has(division.id));
  const manageableDivisionIds = creatableDivisions.map((division) => division.id);
  const taskCounts = new Map<string, number>();
  for (const row of taskRows ?? []) {
    if (!row.project_id) continue;
    taskCounts.set(row.project_id, (taskCounts.get(row.project_id) ?? 0) + 1);
  }

  let members: { id: string; name: string; email: string | null }[] = [];
  let divisionMemberships: DivisionMembershipRow[] = [];
  if (canSeeFinances) {
    const membershipQuery = access.isSuperAdmin
      ? supabase.from("division_members").select("user_id,division_id,role")
      : manageableDivisionIds.length > 0
        ? supabase.from("division_members").select("user_id,division_id,role").in("division_id", manageableDivisionIds)
        : Promise.resolve({ data: [] as DivisionMembershipRow[], error: null });
    const [{ data: memberRows }, membershipResult] = await Promise.all([
      supabase.from("profiles").select("id,full_name,email").eq("is_active", true).order("full_name"),
      membershipQuery,
    ]);
    members = ((memberRows ?? []) as MemberRow[]).map((member) => ({
      id: member.id,
      name: member.full_name ?? member.email ?? "Unknown",
      email: member.email ?? null,
    }));
    divisionMemberships = (membershipResult.data ?? []) as DivisionMembershipRow[];
  }

  const projects = ((projectRows ?? []) as ProjectRow[])
    .filter((project) => access.isSuperAdmin || access.workspaceDivisionIds.has(project.division_id))
    .map((project) => {
    const division = Array.isArray(project.divisions) ? project.divisions[0] : project.divisions;
    const lead = Array.isArray(project.lead) ? project.lead[0] : project.lead;
    return {
      id: project.id,
      name: project.name,
      division_id: project.division_id,
      division_name: division?.name?.replace(/^Sthyra\s+/, "") ?? "Division",
      client: project.client ?? null,
      description: project.description ?? null,
      starts_on: project.starts_on ?? null,
      target_end_on: project.target_end_on ?? null,
      lead_id: project.lead_id ?? null,
      lead_name: lead?.full_name ?? null,
      openTasks: taskCounts.get(project.id) ?? 0,
    };
    });

  return (
    <AppShell divisions={divs.map((d) => ({ slug: d.slug, name: d.name.replace(/^Sthyra\s+/, "") }))} canSeeFinances={canSeeFinances} isOwner={access.isSuperAdmin} initials={initials(profile?.full_name ?? null, profile?.email ?? null)}>
      <main>
        <header className="projects-page-head">
          <div>
            <div className="label" style={{ marginBottom: 7 }}>Projects</div>
            <h1>Projects</h1>
            <p className="head-sub">Create, assign leads, tune timelines, and open each project&apos;s task board from one compact workspace.</p>
          </div>
        </header>
        <ProjectsView
          projects={projects}
          canManageProjects={access.isSuperAdmin || access.manageableDivisionIds.size > 0}
          creatableDivisions={creatableDivisions}
          isOwner={access.isSuperAdmin}
          members={members}
          divisionMemberships={divisionMemberships}
        />
      </main>
    </AppShell>
  );
}
