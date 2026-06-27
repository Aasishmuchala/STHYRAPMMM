"use client";

import { useMemo } from "react";
import { fmtDuration } from "@/lib/format";
import { initials } from "@/lib/format";

export type LogRow = {
  id: string;
  task_id: string;
  profile_id: string;
  started_at: string;
  minutes: number;
  note: string | null;
};

export type PersonRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_seed: string | null;
};

export function TimesheetGrid({
  weekStartIso,
  people,
  logs,
}: {
  weekStartIso: string;
  people: PersonRow[];
  logs: LogRow[];
}) {
  const days = useMemo(() => {
    const start = new Date(weekStartIso + "T00:00:00");
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start.getTime() + i * 86400000);
      const iso = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short" });
      return { iso, label };
    });
  }, [weekStartIso]);

  // Build a per-person, per-day total
  const totals = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    for (const p of people) map.set(p.id, new Map());
    for (const l of logs) {
      const person = map.get(l.profile_id);
      if (!person) continue;
      person.set(l.started_at.slice(0, 10), (person.get(l.started_at.slice(0, 10)) ?? 0) + l.minutes);
    }
    return map;
  }, [people, logs]);

  return (
    <div className="timesheet-wrap">
      <div className="ftable">
        <table>
          <thead>
            <tr>
              <th>Person</th>
              {days.map((d) => (
                <th key={d.iso} style={{ textAlign: "right" }}>{d.label}</th>
              ))}
              <th style={{ textAlign: "right" }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {people.length === 0 ? (
              <tr><td colSpan={9} className="sub">No people yet.</td></tr>
            ) : (
              people.map((p) => {
                const m = totals.get(p.id) ?? new Map<string, number>();
                const total = days.reduce((s, d) => s + (m.get(d.iso) ?? 0), 0);
                return (
                  <tr key={p.id}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span className="avatar mono" aria-hidden>{initials(p.full_name, p.email)}</span>
                        <span>{p.full_name ?? p.email ?? "Member"}</span>
                      </div>
                    </td>
                    {days.map((d) => (
                      <td key={d.iso} className="mono" style={{ textAlign: "right" }}>
                        {(m.get(d.iso) ?? 0) > 0 ? fmtDuration(m.get(d.iso) ?? 0) : <span style={{ opacity: 0.3 }}>·</span>}
                      </td>
                    ))}
                    <td className="mono" style={{ textAlign: "right", fontWeight: 600 }}>
                      {fmtDuration(total)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}