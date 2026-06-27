"use client";

import { useState, useRef } from "react";
import { useDismiss } from "@/lib/useDismiss";
import { beginToast, finishToast } from "@/lib/client-toast";
import type { DivisionOpt, ProjectOpt } from "@/lib/tasks-types";

export type Field =
  | { key: string; label: string; type: "text" | "textarea"; required?: boolean; placeholder?: string; half?: boolean }
  | { key: string; label: string; type: "money"; required?: boolean; half?: boolean }
  | { key: string; label: string; type: "number"; required?: boolean; half?: boolean; step?: string }
  | { key: string; label: string; type: "date"; half?: boolean }
  | { key: string; label: string; type: "select"; options: { value: string; label: string }[]; half?: boolean }
  | { key: string; label: string; type: "division"; half?: boolean }
  | { key: string; label: string; type: "project"; half?: boolean };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Values = Record<string, any>;

export function RecordModal({
  title, fields, initial, divisions, projects, onClose, onSave,
}: {
  title: string;
  fields: Field[];
  initial: Values;
  divisions: DivisionOpt[];
  projects: ProjectOpt[];
  onClose: () => void;
  onSave: (values: Values) => Promise<{ ok: true } | { error: string }>;
}) {
  const [vals, setVals] = useState<Values>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useDismiss(dialogRef, onClose);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  
  const set = (k: string, v: any) => setVals((s) => ({ ...s, [k]: v }));

  const projectField = fields.find((f) => f.type === "project");

  function onDivisionChange(v: string) {
    setVals((s) => ({ ...s, division_id: v, ...(projectField ? { [projectField.key]: "" } : {}) }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    const out: Values = { ...vals };
    for (const f of fields) {
      if (f.type === "money") out[f.key] = Math.round(Number(vals[f.key] || 0) * 100);
      else if (f.type === "number") out[f.key] = Number(vals[f.key] || 0);
      else if (f.type === "date") out[f.key] = vals[f.key] || null;
      else if (f.type === "text" || f.type === "textarea") out[f.key] = (vals[f.key] ?? "").trim() || null;
      else if (f.type === "project" || f.type === "select") out[f.key] = vals[f.key] || null;
    }
    const toastId = beginToast(`Saving ${title.toLowerCase()}...`);
    const res = await onSave(out);
    if (!finishToast(res, { id: toastId, success: `${title} saved.` })) { setErr(res.error); setBusy(false); return; }
    onClose();
  }

  function renderField(f: Field) {
    const id = `f-${f.key}`;
    if (f.type === "division") {
      return (
        <select id={id} className="select" value={vals.division_id ?? ""} onChange={(e) => onDivisionChange(e.target.value)}>
          {divisions.map((d) => <option key={d.id} value={d.id}>{d.name.replace(/^Sthyra\s+/, "")}</option>)}
        </select>
      );
    }
    if (f.type === "project") {
      const opts = projects.filter((p) => p.division_id === vals.division_id);
      return (
        <select id={id} className="select" value={vals[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)}>
          <option value="">— None —</option>
          {opts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      );
    }
    if (f.type === "select") {
      return (
        <select id={id} className="select" value={vals[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)}>
          {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
    }
    if (f.type === "textarea") {
      return <textarea id={id} className="textarea" value={vals[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} placeholder={f.placeholder} />;
    }
    if (f.type === "money") {
      return (
        <div style={{ position: "relative" }}>
          <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "var(--text-dim)", fontSize: 13 }}>₹</span>
          <input id={id} type="number" inputMode="decimal" step="0.01" min="0" className="input" style={{ paddingLeft: 24 }} value={vals[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} placeholder="0" />
        </div>
      );
    }
    if (f.type === "number") {
      return <input id={id} type="number" step={f.step ?? "1"} className="input" value={vals[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} />;
    }
    if (f.type === "date") {
      return <input id={id} type="date" className="input" value={vals[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} />;
    }
    return <input id={id} className="input" value={vals[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} placeholder={f.placeholder} required={f.required} />;
  }

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal" ref={dialogRef} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <form onSubmit={submit}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
            {fields.map((f) => (
              <div className="field" key={f.key} style={{ gridColumn: f.half ? "span 1" : "1 / -1" }}>
                <label className="label" htmlFor={`f-${f.key}`}>{f.label}</label>
                {renderField(f)}
              </div>
            ))}
          </div>
          {err && <div className="form-err" role="alert">{err}</div>}
          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="submit" className="btn" disabled={busy} style={{ opacity: busy ? 0.7 : 1 }}>{busy ? "Saving…" : "Create"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
