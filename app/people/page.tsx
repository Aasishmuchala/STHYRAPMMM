import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/shell/AppShell";
import { PeopleView } from "@/components/people/PeopleView";
import { initials } from "@/lib/format";
import type { DivisionOpt } from "@/lib/tasks-types";
import type { Person, PersonMembership, PersonDaily, PersonTask } from "@/components/people/types";

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ user?: string; div?: string }>;
}) {
  const sp = await searchParams;
  const supabase = (await createClient()) as unknown as SupabaseClient<any, any, any>;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [
    { data: profile },
    { data: memberships },
    { data: divisions },
    { data: workload },
    { data: allMemberships },
  ] = await Promise.all([
    supabase.from("profiles").select("full_name,email,global_role").eq("id", user.id).maybeSingle(),
    supabase.from("division_members").select("role").eq("user_id", user.id),
    supabase.from("divisions").select("id,slug,name").order("slug"),
    supabase.from("profile_workload_v1").select("profile_id,full_name,email,global_role,is_active,open_tasks,done_tasks,overdue_tasks,active_cycles,projects_led,created_at"),
    supabase.from("division_members").select("id,user_id,division_id,role,divisions(name,slug)"),
  ]);

  const isOwner = profile?.global_role === "owner";
  const canSeeFinances = isOwner || (memberships ?? []).some((m) => m.role === "lead");
  if (!canSeeFinances) redirect("/");

  // Build membership lookup keyed by user_id
  const membershipsByUser = new Map<string, PersonMembership[]>();
  for (const row of (allMemberships ?? []) as unknown as Array<{
    id: string; user_id: string; division_id: string; role: string;
    divisions: { name: string; slug: string } | Array<{ name: string; slug: string }> | null;
  }>) {
    const div = Array.isArray(row.divisions) ? row.divisions[0] : row.divisions;
    const list = membershipsByUser.get(row.user_id) ?? [];
    list.push({
      id: row.id,
      division_id: row.division_id,
      division_name: div?.name ?? "",
      division_slug: div?.slug ?? "",
      role: row.role,
    });
    membershipsByUser.set(row.user_id, list);
  }

  const people: Person[] = (workload ?? []).map((r: any) => ({
    id: r.profile_id,
    full_name: r.full_name ?? null,
    email: r.email ?? null,
    global_role: r.global_role ?? "member",
    is_active: r.is_active !== false,
    created_at: r.created_at ?? null,
    open_tasks: r.open_tasks ?? 0,
    done_tasks: r.done_tasks ?? 0,
    overdue_tasks: r.overdue_tasks ?? 0,
    active_cycles: r.active_cycles ?? 0,
    projects_led: r.projects_led ?? 0,
    memberships: membershipsByUser.get(r.profile_id) ?? [],
  }));

  // Optional: fetch last 30 days of completion history + recently completed tasks for the
  // selected user. Done in parallel with the page data so the heavy queries don't block render.
  let daily: PersonDaily[] = [];
  let recentDone: PersonTask[] = [];
  let openTasks: PersonTask[] = [];
  let selectedId: string | null = null;
  if (sp?.user && people.some((p) => p.id === sp.user)) {
    selectedId = sp.user;
    const since = new Date();
    since.setDate(since.getDate() - 29); // 30 inclusive
    const sinceIso = since.toISOString().slice(0, 10);

    const [dailyRes, recentRes, openRes] = await Promise.all([
      supabase
        .from("profile_completion_daily")
        .select("day,count")
        .eq("user_id", selectedId)
        .gte("day", sinceIso)
        .order("day"),
      supabase
        .from("tasks")
        .select("id,title,priority,item_type,due_date,created_at,workflow_stage_id,workflow_stages!tasks_workflow_stage_id_fkey(is_done),projects(name)")
        .eq("assignee_id", selectedId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("tasks")
        .select("id,title,priority,item_type,due_date,workflow_stage_id,workflow_stages!tasks_workflow_stage_id_fkey(is_done),projects(name)")
        .eq("assignee_id", selectedId)
        .is("deleted_at", null)
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(30),
    ]);

    daily = (dailyRes.data ?? []).map((d: any) => ({
      day: d.day,
      count: Number(d.count) || 0,
    }));
    recentDone = (recentRes.data ?? [])
      .filter((r: any) => r.workflow_stages?.is_done === true)
      .slice(0, 8)
      .map((r: any) => ({
        id: r.id,
        title: r.title,
        priority: r.priority,
        item_type: r.item_type,
        project_name: r.projects?.name ?? null,
        completed_at: r.created_at,
        due_date: r.due_date,
      }));
    openTasks = (openRes.data ?? [])
      .filter((r: any) => !r.workflow_stages?.is_done)
      .slice(0, 12)
      .map((r: any) => ({
        id: r.id,
        title: r.title,
        priority: r.priority,
        item_type: r.item_type,
        project_name: r.projects?.name ?? null,
        completed_at: null,
        due_date: r.due_date,
      }));
  }

  const divs: DivisionOpt[] = (divisions ?? []).map((d: DivisionOpt) => ({ id: d.id, slug: d.slug, name: d.name }));

  return (
    <AppShell
      divisions={divs.map((d) => ({ slug: d.slug, name: d.name.replace(/^Sthyra\s+/, "") }))}
      canSeeFinances={canSeeFinances}
      isOwner={isOwner}
      initials={initials(profile?.full_name ?? null, profile?.email ?? null)}
    >
      <main>
        <header className="subhead">
          <div>
            <div className="label" style={{ marginBottom: 9 }}>People</div>
            <h1>Team & workload</h1>
            <p className="head-sub">Click a teammate to see how much work they&apos;ve shipped, what&apos;s on their plate, and how active their cycles are.</p>
          </div>
        </header>
        <PeopleView
          people={people}
          divisions={divs.map((d) => ({ id: d.id, slug: d.slug, name: d.name }))}
          selectedId={selectedId}
          daily={daily}
          recentDone={recentDone}
          openTasks={openTasks}
          currentUserId={user.id}
        />
      </main>
    </AppShell>
  );
}
