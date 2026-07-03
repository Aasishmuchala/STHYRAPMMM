import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/shell/AppShell";
import { buildWorkspaceAccess } from "@/lib/access";
import { readActiveCompanySlug, resolveActiveCompany, isInScope } from "@/lib/activeCompany";
import { initials } from "@/lib/format";
import { PageHeader, Button } from "@/components/ui";
import type { DivisionOpt } from "@/lib/tasks-types";

type RecordRow = {
  id: string;
  user_id: string;
  division_id: string;
  work_date: string;
  checked_in_at: string;
  status: "present" | "late" | "undertime" | "absent";
  location: { name: string | null } | null;
  person: { full_name: string | null; email: string | null } | null;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default async function AttendancePage() {
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
  // A manager of the active company sees the whole team; everyone else, only self.
  const isManager = access.isSuperAdmin || (activeCompany.activeDivisionId != null && access.manageableDivisionIds.has(activeCompany.activeDivisionId)) ||
    [...activeCompany.scope].some((id) => access.manageableDivisionIds.has(id));

  // RLS already limits rows to own-or-managed. Pull ~6 months for the charts.
  const since = new Date();
  since.setMonth(since.getMonth() - 5);
  since.setDate(1);
  const sinceStr = since.toISOString().slice(0, 10);

  const { data: recRows } = await supabase
    .from("attendance_records")
    .select("id,user_id,division_id,work_date,checked_in_at,status,location:attendance_locations(name),person:profiles!attendance_records_user_id_fkey(full_name,email)")
    .gte("work_date", sinceStr)
    .order("checked_in_at", { ascending: false })
    .returns<RecordRow[]>();

  const records = (recRows ?? []).filter((r) => isInScope(activeCompany, r.division_id));
  const myRecords = records.filter((r) => r.user_id === user.id);

  const now = new Date();
  const monthKey = (d: string) => d.slice(0, 7); // YYYY-MM
  const thisMonth = now.toISOString().slice(0, 7);

  const myThisMonth = myRecords.filter((r) => monthKey(r.work_date) === thisMonth);
  const countBy = (rows: RecordRow[], status: RecordRow["status"]) => rows.filter((r) => r.status === status).length;
  const summary = {
    present: countBy(myThisMonth, "present"),
    late: countBy(myThisMonth, "late"),
    undertime: countBy(myThisMonth, "undertime"),
    absent: countBy(myThisMonth, "absent"),
  };
  const myMonthTotal = myThisMonth.length;

  // Last 6 months of the viewer's check-in counts, for the bar chart.
  const monthBuckets: { label: string; count: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = d.toISOString().slice(0, 7);
    const count = myRecords.filter((r) => monthKey(r.work_date) === key).length;
    monthBuckets.push({ label: MONTHS[d.getMonth()] ?? "", count });
  }
  const maxBar = Math.max(1, ...monthBuckets.map((b) => b.count));

  // Manager roster: everyone's present-days this month + last check-in.
  const rosterMap = new Map<string, { name: string; present: number; last: string | null }>();
  if (isManager) {
    for (const r of records) {
      const name = r.person?.full_name || r.person?.email || "Unknown";
      const entry = rosterMap.get(r.user_id) ?? { name, present: 0, last: null };
      if (monthKey(r.work_date) === thisMonth) entry.present += 1;
      if (!entry.last || r.checked_in_at > entry.last) entry.last = r.checked_in_at;
      rosterMap.set(r.user_id, entry);
    }
  }
  const roster = [...rosterMap.values()].sort((a, b) => b.present - a.present);

  const cards = [
    { label: "Present", value: summary.present, color: "var(--accent)", bg: "rgba(59,130,246,.12)" },
    { label: "Late", value: summary.late, color: "#16a34a", bg: "rgba(34,197,94,.12)" },
    { label: "Undertime", value: summary.undertime, color: "#f59e0b", bg: "rgba(245,158,11,.14)" },
    { label: "Absent", value: summary.absent, color: "#ef4444", bg: "rgba(239,68,68,.12)" },
  ];

  return (
    <AppShell
      divisions={divs.map((d) => ({ slug: d.slug, name: d.name.replace(/^Sthyra\s+/, "") }))}
      canSeeFinances={access.canSeeFinances}
      canSeePeople={access.canSeePeople}
      isOwner={access.isSuperAdmin}
      initials={initials(profile?.full_name ?? null, profile?.email ?? null)}
    >
      <main id="main" data-testid="main">
        <PageHeader
          eyebrow="Attendance"
          title={isManager ? "Attendance tracker" : "My attendance"}
          sub={isManager ? "Everyone's check-ins for the active company. Members see only their own." : "Your geo-verified check-ins."}
          actions={<Button href="/attendance/check-in" variant="primary">Check in now</Button>}
        />

        <section className="att-cards" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 18 }}>
          {cards.map((c) => (
            <div key={c.label} className="glass" style={{ padding: 16, borderRadius: 16 }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: c.bg, marginBottom: 12 }} />
              <div style={{ fontSize: 24, fontWeight: 700, color: c.color }}>{String(c.value).padStart(2, "0")}</div>
              <div className="sub" style={{ marginTop: 2 }}>{c.label} this month</div>
            </div>
          ))}
        </section>

        <section className="glass" style={{ padding: 20, borderRadius: 16, marginBottom: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
            <div>
              <div className="label">Check-ins</div>
              <h3 style={{ margin: "4px 0 0" }}>Last 6 months</h3>
            </div>
            <div style={{ fontSize: 28, fontWeight: 700 }}>{myMonthTotal}<span className="sub" style={{ fontSize: 13, fontWeight: 400 }}> this month</span></div>
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 14, height: 140 }}>
            {monthBuckets.map((b) => (
              <div key={b.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{b.count}</div>
                <div style={{ width: "100%", maxWidth: 46, height: `${Math.round((b.count / maxBar) * 100)}%`, minHeight: 4, background: "var(--accent)", borderRadius: 8 }} />
                <div className="sub" style={{ fontSize: 12 }}>{b.label}</div>
              </div>
            ))}
          </div>
        </section>

        {isManager && (
          <section className="glass" style={{ padding: 20, borderRadius: 16 }}>
            <h3 style={{ marginTop: 0, marginBottom: 4 }}>Team attendance</h3>
            <p className="sub" style={{ marginTop: 0 }}>Present days this month, per person.</p>
            {roster.length === 0 ? (
              <p className="sub">No check-ins yet. Once people mark attendance it will appear here.</p>
            ) : (
              <table className="tbl" style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ textAlign: "left" }}>
                    <th className="sub" style={{ padding: "8px 6px" }}>Name</th>
                    <th className="sub" style={{ padding: "8px 6px" }}>Present (this month)</th>
                    <th className="sub" style={{ padding: "8px 6px" }}>Last check-in</th>
                  </tr>
                </thead>
                <tbody>
                  {roster.map((p, i) => (
                    <tr key={i} style={{ borderTop: "1px solid var(--border, rgba(0,0,0,.06))" }}>
                      <td style={{ padding: "10px 6px", fontWeight: 600 }}>{p.name}</td>
                      <td style={{ padding: "10px 6px" }}>{p.present}</td>
                      <td className="sub" style={{ padding: "10px 6px" }}>{p.last ? new Date(p.last).toLocaleString() : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )}
      </main>
    </AppShell>
  );
}
