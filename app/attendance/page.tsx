import Link from "next/link";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  FiActivity,
  FiCalendar,
  FiCheckCircle,
  FiChevronRight,
  FiClock,
  FiLogIn,
  FiTrendingUp,
  FiUserX,
  FiUsers,
} from "react-icons/fi";
import { CheckinsChart } from "@/components/attendance/CheckinsChart";
import { AppShell } from "@/components/shell/AppShell";
import { AvatarStack, DonutChart, StatCard } from "@/components/ui";
import { readActiveCompanySlug, resolveActiveCompany, isInScope } from "@/lib/activeCompany";
import { buildWorkspaceAccess } from "@/lib/access";
import { initials } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
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

type WeeklySeriesPoint = {
  label: string;
  count: number;
  range: string;
};

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HEATMAP_WEEKS = 4;
const CHART_WEEKS = 12;

function weekdayMon(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  const wd = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)).getUTCDay();
  return (wd + 6) % 7;
}

function parseYmd(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

function ymdLocal(dt: Date): string {
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function ymLocal(dt: Date): string {
  return ymdLocal(dt).slice(0, 7);
}

function startOfWeek(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diff = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function weekRangeLabel(start: Date): string {
  const end = addDays(start, 6);
  return `${start.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} - ${end.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  })}`;
}

function isLoggedStatus(status: RecordRow["status"]): boolean {
  return status !== "absent";
}

export default async function AttendancePage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as unknown as SupabaseClient<any, any, any>;
  const {
    data: { user },
  } = await supabase.auth.getUser();
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
  const isManager =
    access.isSuperAdmin ||
    (activeCompany.activeDivisionId != null && access.manageableDivisionIds.has(activeCompany.activeDivisionId)) ||
    [...activeCompany.scope].some((id) => access.manageableDivisionIds.has(id));

  const since = new Date();
  since.setMonth(since.getMonth() - 5);
  since.setDate(1);
  const sinceStr = since.toISOString().slice(0, 10);

  const { data: recRows } = await supabase
    .from("attendance_records")
    .select(
      "id,user_id,division_id,work_date,checked_in_at,status,location:attendance_locations(name),person:profiles!attendance_records_user_id_fkey(full_name,email)",
    )
    .gte("work_date", sinceStr)
    .order("checked_in_at", { ascending: false })
    .returns<RecordRow[]>();

  const records = (recRows ?? []).filter((r) => isInScope(activeCompany, r.division_id));
  const myRecords = records.filter((r) => r.user_id === user.id);
  const scopeRecords = isManager ? records : myRecords;
  const loggedScopeRecords = scopeRecords.filter((r) => isLoggedStatus(r.status));

  const now = new Date();
  const monthKey = (s: string) => s.slice(0, 7);
  const thisMonth = ymLocal(now);

  const myThisMonth = myRecords.filter((r) => monthKey(r.work_date) === thisMonth);
  const countBy = (rows: RecordRow[], status: RecordRow["status"]) => rows.filter((r) => r.status === status).length;
  const summary = {
    present: countBy(myThisMonth, "present"),
    late: countBy(myThisMonth, "late"),
    undertime: countBy(myThisMonth, "undertime"),
    absent: countBy(myThisMonth, "absent"),
  };

  const total = myThisMonth.length;
  const pctOf = (value: number) => (total > 0 ? Math.round((value / total) * 100) : 0);

  const weeklyCounts = new Map<string, number>();
  for (const row of loggedScopeRecords) {
    const weekKey = ymdLocal(startOfWeek(parseYmd(row.work_date)));
    weeklyCounts.set(weekKey, (weeklyCounts.get(weekKey) ?? 0) + 1);
  }

  const currentWeekStart = startOfWeek(now);
  const weeklySeries: WeeklySeriesPoint[] = [];
  for (let i = CHART_WEEKS - 1; i >= 0; i--) {
    const weekStart = addDays(currentWeekStart, -i * 7);
    const key = ymdLocal(weekStart);
    weeklySeries.push({
      label: weekStart.toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
      count: weeklyCounts.get(key) ?? 0,
      range: weekRangeLabel(weekStart),
    });
  }

  const rosterMap = new Map<string, { name: string; present: number; last: string | null }>();
  if (isManager) {
    for (const row of records) {
      const name = row.person?.full_name || row.person?.email || "Unknown";
      const entry = rosterMap.get(row.user_id) ?? { name, present: 0, last: null };
      if (monthKey(row.work_date) === thisMonth && isLoggedStatus(row.status)) entry.present += 1;
      if (isLoggedStatus(row.status) && (!entry.last || row.checked_in_at > entry.last)) entry.last = row.checked_in_at;
      rosterMap.set(row.user_id, entry);
    }
  }

  const roster = [...rosterMap.values()].sort((a, b) => b.present - a.present || a.name.localeCompare(b.name));
  const maxPresent = Math.max(1, ...roster.map((person) => person.present));

  const heatmapCutoff = ymdLocal(addDays(currentWeekStart, -(HEATMAP_WEEKS - 1) * 7));
  const heatMap = new Map<string, { name: string; counts: number[]; total: number }>();
  for (const row of loggedScopeRecords) {
    if (row.work_date < heatmapCutoff) continue;
    const name = row.person?.full_name || row.person?.email || "You";
    const entry = heatMap.get(row.user_id) ?? { name, counts: [0, 0, 0, 0, 0, 0, 0], total: 0 };
    const wd = weekdayMon(row.work_date);
    entry.counts[wd] = (entry.counts[wd] ?? 0) + 1;
    entry.total += 1;
    heatMap.set(row.user_id, entry);
  }

  const heatRows = [...heatMap.values()]
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
    .slice(0, isManager ? 8 : 1);
  const heatMax = Math.max(1, ...heatRows.flatMap((row) => row.counts));
  const heatBucket = (count: number) => (count <= 0 ? 0 : count / heatMax >= 0.66 ? 3 : count / heatMax >= 0.33 ? 2 : 1);

  const activeDays = new Set(loggedScopeRecords.map((row) => row.work_date));
  let streak = 0;
  for (let i = 0; i < 90; i++) {
    const day = new Date(now);
    day.setDate(now.getDate() - i);
    if (activeDays.has(ymdLocal(day))) streak += 1;
    else if (i > 0) break;
    else break;
  }

  const attendancePct = pctOf(summary.present);
  const onTrack = total > 0 && summary.late === 0 && summary.absent === 0;

  const statCfg = [
    { label: "Present", value: summary.present, color: "#16a34a", Icon: FiCheckCircle },
    { label: "Late", value: summary.late, color: "#f59e0b", Icon: FiClock },
    { label: "Undertime", value: summary.undertime, color: "#3b82f6", Icon: FiActivity },
    { label: "Absent", value: summary.absent, color: "#ef4444", Icon: FiUserX },
  ];
  const donutSegments = statCfg.map((item) => ({ label: item.label, value: item.value, color: item.color }));

  const insights = [
    onTrack
      ? {
          Icon: FiUsers,
          tint: "#0d9488",
          title: `${attendancePct}% attendance`,
          sub: isManager ? "Everyone is present so far this month." : "You have been present all month.",
        }
      : {
          Icon: FiUsers,
          tint: "#0d9488",
          title: `${attendancePct}% attendance`,
          sub: `${summary.late} late, ${summary.absent} absent this month.`,
        },
    isManager
      ? {
          Icon: FiTrendingUp,
          tint: "#3b82f6",
          title: "Active team",
          sub: `${roster.length} member${roster.length === 1 ? "" : "s"} checked in this month.`,
        }
      : { Icon: FiTrendingUp, tint: "#3b82f6", title: "Consistent", sub: "Great consistency. Keep it up." },
    { Icon: FiCalendar, tint: "#8b5cf6", title: "Monthly streak", sub: `${streak} consecutive active day${streak === 1 ? "" : "s"}.` },
  ];

  const firstName = (profile?.full_name ?? "there").split(" ")[0];
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });

  return (
    <AppShell
      divisions={divs.map((d) => ({ slug: d.slug, name: d.name.replace(/^Sthyra\s+/, "") }))}
      canSeeFinances={access.canSeeFinances}
      canSeePeople={access.canSeePeople}
      isOwner={access.isSuperAdmin}
      initials={initials(profile?.full_name ?? null, profile?.email ?? null)}
    >
      <main id="main" data-testid="main" className="att-main">
        <header className="att-head">
          <div>
            <div className="att-greet">{greeting}, {firstName}</div>
            <h1 className="att-title">Attendance Tracker</h1>
            <p className="head-sub">
              {isManager ? "Everyone's check-ins for the active company. Members see only their own." : "Your geo-verified check-ins."}
            </p>
          </div>
          <Link href="/attendance/check-in" className="btn btn-teal">
            <FiLogIn size={15} />
            Check in now
          </Link>
        </header>

        <section className="att-kpis" aria-label="This month's attendance">
          {statCfg.map((item) => (
            <StatCard
              key={item.label}
              label={`${item.label} - this month`}
              value={String(item.value).padStart(2, "0")}
              accent={item.color}
              icon={<item.Icon size={16} />}
              delta={`${pctOf(item.value)}% of total`}
              trend="flat"
            />
          ))}
        </section>

        <section className="att-row2">
          <div className="panel">
            <CheckinsChart data={weeklySeries} />
          </div>

          <div className="panel statusmix-panel">
            <div className="panel-head">
              <div>
                <h3 className="panel-title">Status mix</h3>
                <p className="panel-sub">{now.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</p>
              </div>
            </div>
            <div className="statusmix">
              <div className="status-ring">
                <DonutChart segments={donutSegments} size={150} thickness={18} trackColor="var(--track)">
                  <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em" }}>{total}</div>
                  <div className="sub" style={{ fontSize: 11 }}>
                    Days logged
                  </div>
                </DonutChart>
              </div>
              <div className="legend">
                {donutSegments.map((segment) => (
                  <div className="legend-row" key={segment.label}>
                    <span className="legend-dot" style={{ background: segment.color }} />
                    <span className="lg-label">{segment.label}</span>
                    <span className="lg-value">
                      {segment.value} <span className="lg-pct">({pctOf(segment.value)}%)</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
            {total > 0 && (
              <div className={`att-banner ${onTrack ? "ok" : "warn"}`}>
                <FiCheckCircle size={15} />
                <span>
                  {onTrack
                    ? isManager
                      ? "Great! Everyone is on track this month."
                      : "You are on track this month."
                    : `${summary.late} late, ${summary.absent} absent this month.`}
                </span>
              </div>
            )}
          </div>

          <div className="panel">
            <div className="panel-head">
              <div>
                <h3 className="panel-title">{isManager ? "Team attendance" : "Recent check-ins"}</h3>
                <p className="panel-sub">{isManager ? "Logged days this month, per person." : "Your latest activity."}</p>
              </div>
            </div>
            {isManager ? (
              roster.length === 0 ? (
                <p className="sub">No check-ins yet.</p>
              ) : (
                <div className="tm-table">
                  <div className="tm-head">
                    <span>Team member</span>
                    <span>Last check-in</span>
                    <span className="tm-days-h">Days</span>
                  </div>
                  {roster.map((person, index) => (
                    <div className="tm-row" key={index}>
                      <div className="tm-person">
                        <AvatarStack names={[person.name]} size={34} />
                        <span className="tm-name">{person.name}</span>
                      </div>
                      <div className="tm-last">{person.last ? fmtTime(person.last) : "-"}</div>
                      <div className="tm-days">
                        <div className="tm-bar">
                          <span style={{ width: `${Math.round((person.present / maxPresent) * 100)}%` }} />
                        </div>
                        <b>{person.present}</b>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : myRecords.length === 0 ? (
              <p className="sub">No check-ins yet.</p>
            ) : (
              <div className="tm-table">
                {myRecords.slice(0, 6).map((row) => (
                  <div className="tm-row simple" key={row.id}>
                    <div className="tm-person">
                      <span className={`tm-status-dot s-${row.status}`} />
                      <span className="tm-name" style={{ textTransform: "capitalize" }}>
                        {row.status}
                      </span>
                    </div>
                    <div className="tm-last">{fmtTime(row.checked_in_at)}</div>
                    <div className="tm-days">{row.location?.name ?? ""}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="att-row3">
          <div className="panel heatmap-panel">
            <div className="panel-head">
              <div>
                <h3 className="panel-title">Weekly attendance heatmap</h3>
                <p className="panel-sub">Last {HEATMAP_WEEKS} weeks of {isManager ? "team" : "your"} activity, by weekday.</p>
              </div>
            </div>
            {heatRows.length === 0 ? (
              <p className="sub">No activity to chart yet.</p>
            ) : (
              <div className="heatmap">
                <div className="heatmap-scroll">
                  <div className="hm-grid">
                    <div className="hm-cols">
                      <span />
                      {DOW.map((day) => (
                        <span key={day} className="hm-col-label">
                          {day}
                        </span>
                      ))}
                    </div>
                    {heatRows.map((row, index) => (
                      <div className="hm-row" key={index}>
                        <span className="hm-name">{row.name}</span>
                        {row.counts.map((count, cellIndex) => (
                          <span
                            key={cellIndex}
                            className={`hm-cell hm-${heatBucket(count)}`}
                            title={`${row.name} - ${DOW[cellIndex]}: ${count}`}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="hm-legend">
                  <span className="hm-cell hm-3" /> Strong
                  <span className="hm-cell hm-2" /> Moderate
                  <span className="hm-cell hm-1" /> Light
                  <span className="hm-cell hm-0" /> No activity
                </div>
              </div>
            )}
          </div>

          <div className="panel">
            <div className="panel-head">
              <div>
                <h3 className="panel-title">Insights</h3>
              </div>
            </div>
            <div className="insights">
              {insights.map((item, index) => (
                <div className="insight" key={index}>
                  <span
                    className="insight-ic"
                    style={{ background: `color-mix(in srgb, ${item.tint} 15%, transparent)`, color: item.tint }}
                  >
                    <item.Icon size={17} />
                  </span>
                  <div className="insight-text">
                    <div className="insight-title">{item.title}</div>
                    <div className="insight-sub">{item.sub}</div>
                  </div>
                  <FiChevronRight size={16} className="insight-chev" />
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </AppShell>
  );
}
