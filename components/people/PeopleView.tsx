"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { initials as initialsOf } from "@/lib/format";
import { avatarBg } from "@/lib/avatar";
import type { DivisionMeta, Person, PersonDaily, PersonTask } from "./types";

const PRIORITY_COLOR: Record<string, string> = {
  highest: "var(--danger)",
  high: "var(--warning)",
  medium: "var(--accent)",
  low: "var(--text-dim)",
  lowest: "var(--text-faint)",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? iso + "T00:00:00" : iso);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

function SparkBars({ data, height = 56 }: { data: PersonDaily[]; height?: number }) {
  // Pad to the last 30 days so a brand-new account with no completions still renders as 30 zeros.
  const today = new Date();
  const days: { day: string; count: number }[] = [];
  const map = new Map(data.map((d) => [d.day, d.count]));
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push({ day: key, count: map.get(key) ?? 0 });
  }
  const max = Math.max(1, ...days.map((d) => d.count));
  const w = 30;
  const totalW = days.length * (w + 3) - 3;
  return (
    <svg
      role="img"
      aria-label={`Tasks completed in the last 30 days: ${days.reduce((s, d) => s + d.count, 0)}`}
      width="100%"
      height={height}
      viewBox={`0 0 ${totalW} ${height}`}
      preserveAspectRatio="none"
      style={{ display: "block" }}
    >
      {days.map((d, i) => {
        const h = max ? Math.max(2, Math.round((d.count / max) * (height - 6))) : 2;
        const x = i * (w + 3);
        const y = height - h;
        return (
          <rect
            key={d.day}
            x={x}
            y={y}
            width={w}
            height={h}
            rx={2}
            fill="var(--user-accent, var(--accent))"
            opacity={d.count === 0 ? 0.18 : 0.92}
          >
            <title>{`${d.day} - ${d.count} task${d.count === 1 ? "" : "s"}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

function Donut({ value, total, size = 64, stroke = 7, color = "var(--user-accent, var(--accent))" }: {
  value: number; total: number; size?: number; stroke?: number; color?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = total ? Math.max(0, Math.min(1, value / total)) : 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--track)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${c * pct} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}

function TaskPill({ task }: { task: PersonTask }) {
  return (
    <div className="person-task">
      <span className="person-task-dot" style={{ background: PRIORITY_COLOR[task.priority ?? ""] ?? "var(--text-faint)" }} />
      <span className="person-task-title">{task.title}</span>
      <span className="person-task-meta">
        {task.item_type && <span className="person-task-type">{task.item_type}</span>}
        {task.project_name && <span className="person-task-project">{task.project_name}</span>}
        <span className="person-task-due">{fmtDate(task.due_date)}</span>
      </span>
    </div>
  );
}

export function PeopleView({
  people,
  divisions,
  selectedId,
  daily,
  recentDone,
  openTasks,
  currentUserId,
}: {
  people: Person[];
  divisions: DivisionMeta[];
  selectedId: string | null;
  daily: PersonDaily[];
  recentDone: PersonTask[];
  openTasks: PersonTask[];
  currentUserId: string;
}) {
  const searchParams = useSearchParams();

  const sortedPeople = useMemo(() => {
    // Owners float to top, then by total shipped desc. Less-noisy than alphabetical.
    const score = (p: Person) => p.done_tasks + p.active_cycles + p.projects_led * 3;
    return people
      .slice()
      .sort((a, b) => {
        const rank = (p: Person) => (p.global_role === "owner" ? 0 : p.id === currentUserId ? 1 : 2);
        const r = rank(a) - rank(b);
        if (r !== 0) return r;
        return score(b) - score(a);
      });
  }, [people, currentUserId]);

  const totalDone = useMemo(() => people.reduce((s, p) => s + p.done_tasks, 0), [people]);
  const totalOpen = useMemo(() => people.reduce((s, p) => s + p.open_tasks, 0), [people]);

  function detailHref(id: string | null) {
    const next = new URLSearchParams(searchParams.toString());
    if (id) next.set("user", id);
    else next.delete("user");
    const q = next.toString();
    return q ? `/people?${q}` : "/people";
  }

  return (
    <div className="people-wrap">
      <section className="set-card people-summary">
        <div className="people-summary-stat">
          <div className="label">Active members</div>
          <div className="people-summary-num">{people.length}</div>
        </div>
        <div className="people-summary-stat">
          <div className="label">Open work</div>
          <div className="people-summary-num">{totalOpen}</div>
        </div>
        <div className="people-summary-stat">
          <div className="label">Shipped (lifetime)</div>
          <div className="people-summary-num">{totalDone}</div>
        </div>
        <div className="people-summary-stat">
          <div className="label">Divisions</div>
          <div className="people-summary-num">{divisions.length}</div>
        </div>
      </section>

      <section className="people-grid">
        <div className="people-roster">
          <div className="label people-section-title">Roster</div>
          <div className="people-roster-list">
            {sortedPeople.length === 0 && (
              <div className="people-empty">No teammates yet. Invite them from Settings → Member access.</div>
            )}
            {sortedPeople.map((person) => {
              const total = person.open_tasks + person.done_tasks;
              const isSelected = selectedId === person.id;
              const divNames = person.memberships
                .map((m) => m.division_name.replace(/^Sthyra\s+/, ""))
                .slice(0, 2)
                .join(" · ");
              return (
                <Link
                  key={person.id}
                  href={detailHref(isSelected ? null : person.id)}
                  className={`person-row${isSelected ? " on" : ""}`}
                  aria-current={isSelected ? "page" : undefined}
                >
                  <span className="person-avatar" style={{ background: avatarBg(person.id) }}>
                    {initialsOf(person.full_name, person.email)}
                  </span>
                  <span className="person-info">
                    <span className="person-row-name">
                      {person.full_name ?? person.email ?? "Unnamed"}
                      {person.global_role === "owner" && <span className="role-pill">owner</span>}
                      {person.id === currentUserId && <span className="role-pill">you</span>}
                    </span>
                    <span className="person-row-meta">
                      {divNames || (person.email ?? "")}
                    </span>
                  </span>
                  <span className="person-row-stats">
                    <Donut value={person.done_tasks} total={Math.max(1, total)} size={36} stroke={4} />
                    <span className="person-row-num mono">
                      <strong>{person.done_tasks}</strong>
                      <span className="person-row-num-of">/{total}</span>
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="people-detail">
          {!selectedId && (
            <div className="set-card people-detail-empty">
              <h3>Pick a teammate</h3>
              <p className="sub">Click a row on the left to see their completion history, active cycles, and the open work on their plate.</p>
            </div>
          )}
          {selectedId && (() => {
            const person = people.find((p) => p.id === selectedId);
            if (!person) return null;
            const total = person.open_tasks + person.done_tasks;
            const completionPct = total ? Math.round((person.done_tasks / total) * 100) : 0;
            const totalLast30 = daily.reduce((s, d) => s + d.count, 0);
            return (
              <>
                <section className="set-card person-header">
                  <div className="person-header-main">
                    <span className="person-avatar person-avatar-lg" style={{ background: avatarBg(person.id) }}>
                      {initialsOf(person.full_name, person.email)}
                    </span>
                    <div>
                      <h3 className="person-header-name">
                        {person.full_name ?? person.email ?? "Unnamed"}
                        {person.global_role === "owner" && <span className="role-pill">owner</span>}
                      </h3>
                      <div className="person-header-email">{person.email}</div>
                      <div className="person-header-divs">
                        {person.memberships.length === 0 && <span className="sub">No divisions yet</span>}
                        {person.memberships.map((m) => (
                          <span key={m.id} className="mdiv">
                            <Link href={`/divisions/${m.division_slug}`} className="mdiv-link">
                              {m.division_name.replace(/^Sthyra\s+/, "")}
                            </Link>
                            <span className="mdiv-role">{m.role}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="person-header-stats">
                    <div className="person-stat">
                      <div className="label">Completion</div>
                      <div className="person-stat-num">{completionPct}%</div>
                    </div>
                    <div className="person-stat">
                      <div className="label">Open</div>
                      <div className="person-stat-num">{person.open_tasks}</div>
                    </div>
                    <div className="person-stat">
                      <div className="label">Overdue</div>
                      <div className={`person-stat-num${person.overdue_tasks > 0 ? " warn" : ""}`}>{person.overdue_tasks}</div>
                    </div>
                    <div className="person-stat">
                      <div className="label">Active cycles</div>
                      <div className="person-stat-num">{person.active_cycles}</div>
                    </div>
                    <div className="person-stat">
                      <div className="label">Projects led</div>
                      <div className="person-stat-num">{person.projects_led}</div>
                    </div>
                  </div>
                </section>

                <section className="set-card">
                  <div className="people-section-row">
                    <div>
                      <h3>Last 30 days</h3>
                      <p className="sub">Tasks completed per day. Empty days still show up so quiet stretches are visible.</p>
                    </div>
                    <div className="people-section-figure mono">
                      <strong>{totalLast30}</strong> shipped
                    </div>
                  </div>
                  <SparkBars data={daily} />
                </section>

                <section className="set-card">
                  <div className="people-section-row">
                    <h3>On their plate</h3>
                    <Link href={`/tasks?assignee=${person.id}`} className="person-open-link">
                      Open in Tasks →
                    </Link>
                  </div>
                  {openTasks.length === 0 ? (
                    <div className="people-empty">No open work assigned. Nice and clear.</div>
                  ) : (
                    <div className="person-task-list">
                      {openTasks.map((task) => (
                        <TaskPill key={task.id} task={task} />
                      ))}
                    </div>
                  )}
                </section>

                <section className="set-card">
                  <h3>Recently shipped</h3>
                  {recentDone.length === 0 ? (
                    <div className="people-empty">Nothing shipped yet — give it time.</div>
                  ) : (
                    <div className="person-task-list">
                      {recentDone.map((task) => (
                        <TaskPill key={task.id} task={task} />
                      ))}
                    </div>
                  )}
                </section>
              </>
            );
          })()}
        </div>
      </section>
    </div>
  );
}
