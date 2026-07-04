import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/shell/AppShell";
import { buildWorkspaceAccess } from "@/lib/access";
import { readActiveCompanySlug, resolveActiveCompany } from "@/lib/activeCompany";
import { initials } from "@/lib/format";
import { SalesView, type Deal, type SalesTarget, type Activity } from "@/components/sales/SalesView";
import type { DivisionOpt } from "@/lib/tasks-types";

type DealRow = Deal & { owner_id: string };

export default async function SalesPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as unknown as SupabaseClient<any, any, any>;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: memberships }, { data: divisions }] = await Promise.all([
    supabase.from("profiles").select("full_name,email,global_role").eq("id", user.id).maybeSingle(),
    supabase.from("division_members").select("role,division_id").eq("user_id", user.id),
    supabase.from("divisions").select("id,slug,name").order("slug"),
  ]);
  const membershipRows = (memberships ?? []) as { role: string; division_id: string }[];
  const access = buildWorkspaceAccess(profile?.global_role, membershipRows);
  const divs: DivisionOpt[] = ((divisions ?? []) as DivisionOpt[]).filter(
    (d) => access.isSuperAdmin || access.workspaceDivisionIds.has(d.id) || access.financeDivisionIds.has(d.id),
  );
  const activeCompany = resolveActiveCompany(await readActiveCompanySlug(), divs, access.isSuperAdmin);

  // Sales is a single-company view. Owners on "All companies" default to the first.
  const effective = divs.find((d) => d.id === activeCompany.activeDivisionId) ?? divs[0] ?? null;
  const isManager = !!effective && (access.isSuperAdmin || access.manageableDivisionIds.has(effective.id));

  const now = new Date();
  const monthFirst = `${now.toISOString().slice(0, 7)}-01`;
  const todayStr = now.toISOString().slice(0, 10);

  let deals: DealRow[] = [];
  let target: SalesTarget | null = null;
  let myActivity: Activity | null = null;
  let teamCallsToday = 0;

  if (effective) {
    const [dealRes, targetRes, myActRes, teamActRes] = await Promise.all([
      supabase
        .from("sales_deals")
        .select("id,title,company_name,segment,stage,value_paise,expected_close,closed_at,owner_id,owner:profiles!sales_deals_owner_id_fkey(full_name)")
        .eq("division_id", effective.id)
        .order("created_at", { ascending: false })
        .returns<(DealRow & { owner: { full_name: string | null } | null })[]>(),
      supabase.from("sales_targets").select("*").eq("division_id", effective.id).eq("month", monthFirst).maybeSingle<SalesTarget>(),
      supabase.from("sales_activities").select("calls,emails,meetings,notes").eq("division_id", effective.id).eq("user_id", user.id).eq("activity_date", todayStr).maybeSingle<Activity>(),
      supabase.from("sales_activities").select("calls").eq("division_id", effective.id).eq("activity_date", todayStr).returns<{ calls: number }[]>(),
    ]);
    deals = ((dealRes.data ?? []) as (DealRow & { owner: { full_name: string | null } | null })[]).map((d) => ({
      ...d,
      owner_name: d.owner?.full_name ?? null,
    }));
    target = targetRes.data ?? null;
    myActivity = myActRes.data ?? null;
    teamCallsToday = (teamActRes.data ?? []).reduce((s, r) => s + (r.calls ?? 0), 0);
  }

  return (
    <AppShell
      divisions={divs.map((d) => ({ slug: d.slug, name: d.name.replace(/^Sthyra\s+/, "") }))}
      canSeeFinances={access.canSeeFinances}
      canSeePeople={access.canSeePeople}
      isOwner={access.isSuperAdmin}
      initials={initials(profile?.full_name ?? null, profile?.email ?? null)}
    >
      <main id="main" data-testid="main">
        <header className="subhead">
          <div>
            <div className="label" style={{ marginBottom: 9 }}>Sales &amp; marketing</div>
            <h1>{effective ? effective.name.replace(/^Sthyra\s+/, "") : "Sales"} pipeline</h1>
            <p className="head-sub">
              {effective
                ? "Targets, deal pipeline by segment, and daily outreach. Members see their own deals; managers see the team."
                : "You're not part of any company yet."}
            </p>
          </div>
        </header>
        {effective ? (
          <SalesView
            divisionId={effective.id}
            isManager={isManager}
            deals={deals}
            target={target}
            myActivity={myActivity}
            teamCallsToday={teamCallsToday}
            monthIso={todayStr}
          />
        ) : (
          <section className="glass" style={{ padding: 22 }}>
            <p className="sub">Ask an owner to add you to a company to start tracking sales.</p>
          </section>
        )}
      </main>
    </AppShell>
  );
}
