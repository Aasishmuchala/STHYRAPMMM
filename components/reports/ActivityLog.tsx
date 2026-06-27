"use client";

import { useMemo, useState } from "react";

export type ActivityChange = { old: string | null; new: string | null };
export type ActivityEntry = {
  id: number;
  actor_name: string;
  action: string;
  entity_type: string;
  entity_label: string | null;
  changes: Record<string, ActivityChange> | null;
  created_at: string;
};

const ACTION_COLOR: Record<string, string> = {
  created: "var(--positive, #16a34a)",
  updated: "var(--accent, #3b82f6)",
  deleted: "var(--danger, #d9667a)",
  restored: "var(--warning, #d97706)",
};

// Pretty labels for raw table / field names.
function humanize(value: string): string {
  return value
    .replace(/_id$/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function entityLabel(type: string): string {
  const singular = type.endsWith("s") ? type.slice(0, -1) : type;
  return humanize(singular);
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function dayKey(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, today)) return "Today";
  if (sameDay(d, yest)) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

function truncate(v: string | null, n = 60): string {
  if (v === null || v === undefined || v === "") return "—";
  return v.length > n ? v.slice(0, n) + "…" : v;
}

export function ActivityLog({ entries }: { entries: ActivityEntry[] }) {
  const [type, setType] = useState("all");
  const [action, setAction] = useState("all");
  const [q, setQ] = useState("");

  const types = useMemo(
    () => Array.from(new Set(entries.map((e) => e.entity_type))).sort(),
    [entries]
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return entries.filter((e) => {
      if (type !== "all" && e.entity_type !== type) return false;
      if (action !== "all" && e.action !== action) return false;
      if (needle) {
        const hay = `${e.actor_name} ${e.entity_type} ${e.entity_label ?? ""} ${e.action}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [entries, type, action, q]);

  const groups = useMemo(() => {
    const map = new Map<string, ActivityEntry[]>();
    for (const e of filtered) {
      const key = dayKey(e.created_at);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return Array.from(map.entries());
  }, [filtered]);

  return (
    <div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
        <input
          className="input"
          placeholder="Search by person, item, action…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ flex: "1 1 240px", minWidth: 200 }}
        />
        <select className="input" value={type} onChange={(e) => setType(e.target.value)} style={{ width: "auto" }}>
          <option value="all">All areas</option>
          {types.map((t) => (
            <option key={t} value={t}>{entityLabel(t)}</option>
          ))}
        </select>
        <select className="input" value={action} onChange={(e) => setAction(e.target.value)} style={{ width: "auto" }}>
          <option value="all">All actions</option>
          <option value="created">Created</option>
          <option value="updated">Updated</option>
          <option value="deleted">Deleted</option>
          <option value="restored">Restored</option>
        </select>
        <span className="sub" style={{ whiteSpace: "nowrap" }}>{filtered.length} events</span>
      </div>

      {groups.length === 0 ? (
        <p className="sub">No activity matches these filters yet.</p>
      ) : (
        groups.map(([day, items]) => (
          <div key={day} style={{ marginBottom: 22 }}>
            <div className="label" style={{ marginBottom: 8 }}>{day}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {items.map((e) => (
                <ActivityRow key={e.id} entry={e} />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function ActivityRow({ entry }: { entry: ActivityEntry }) {
  const [open, setOpen] = useState(false);
  const changeKeys = entry.changes ? Object.keys(entry.changes) : [];
  const hasDetail = changeKeys.length > 0;
  const color = ACTION_COLOR[entry.action] ?? "var(--text-dim)";

  return (
    <div
      className="glass"
      style={{ padding: "11px 14px", borderRadius: 10, display: "flex", flexDirection: "column", gap: 6 }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--text-dim)", fontSize: 12.5, minWidth: 46 }}>
          {fmtTime(entry.created_at)}
        </span>
        <strong style={{ fontSize: 13.5 }}>{entry.actor_name}</strong>
        <span
          style={{
            fontSize: 11.5,
            fontWeight: 600,
            color,
            border: `1px solid color-mix(in srgb, ${color} 35%, transparent)`,
            background: `color-mix(in srgb, ${color} 10%, transparent)`,
            borderRadius: 6,
            padding: "1px 7px",
            textTransform: "capitalize",
          }}
        >
          {entry.action}
        </span>
        <span className="sub" style={{ fontSize: 13 }}>
          {entityLabel(entry.entity_type)}
          {entry.entity_label ? <> · <span style={{ color: "var(--text)" }}>{entry.entity_label}</span></> : null}
        </span>
        {hasDetail && (
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setOpen((v) => !v)}
            style={{ marginLeft: "auto", fontSize: 12, padding: "2px 8px" }}
          >
            {open ? "Hide" : `${changeKeys.length} change${changeKeys.length === 1 ? "" : "s"}`}
          </button>
        )}
      </div>

      {open && hasDetail && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingLeft: 56 }}>
          {changeKeys.map((field) => {
            const c = entry.changes?.[field];
            if (!c) return null;
            return (
              <div key={field} style={{ fontSize: 12.5, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <span className="sub" style={{ minWidth: 110 }}>{humanize(field)}</span>
                <span style={{ color: "var(--text-dim)", textDecoration: "line-through" }}>{truncate(c.old)}</span>
                <span style={{ color: "var(--text-dim)" }}>→</span>
                <span style={{ color: "var(--text)" }}>{truncate(c.new)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
