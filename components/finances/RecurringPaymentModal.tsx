"use client";

import { useMemo, useRef, useState } from "react";
import { useDismiss } from "@/lib/useDismiss";
import type { DivisionOpt, ProjectOpt } from "@/lib/tasks-types";
import type { EmployeeOption, RecurringPayment } from "@/lib/finances-types";
import type { RecurringCadence, RecurringKind, RecurringStatus } from "@/lib/recurring";

type Draft = {
  kind: RecurringKind;
  cadence: RecurringCadence;
  label: string;
  vendor: string;
  division_id: string;
  project_id: string;
  profile_id: string;
  amount: string;
  starts_on: string;
  ends_on: string;
  status: RecurringStatus;
  notes: string;
};

function toDraft(initial: RecurringPayment | null, divisions: DivisionOpt[]): Draft {
  if (!initial) {
    return {
      kind: "salary",
      cadence: "monthly",
      label: "",
      vendor: "",
      division_id: divisions[0]?.id ?? "",
      project_id: "",
      profile_id: "",
      amount: "",
      starts_on: new Date().toISOString().slice(0, 10),
      ends_on: "",
      status: "active",
      notes: "",
    };
  }

  return {
    kind: initial.kind,
    cadence: initial.cadence,
    label: initial.label,
    vendor: initial.vendor ?? "",
    division_id: initial.division_id,
    project_id: initial.project_id ?? "",
    profile_id: initial.profile_id ?? "",
    amount: `${Math.round(initial.amount_paise) / 100}`,
    starts_on: initial.starts_on,
    ends_on: initial.ends_on ?? "",
    status: initial.status,
    notes: initial.notes ?? "",
  };
}

export function RecurringPaymentModal({
  initial,
  divisions,
  projects,
  employees,
  onClose,
  onSave,
}: {
  initial: RecurringPayment | null;
  divisions: DivisionOpt[];
  projects: ProjectOpt[];
  employees: EmployeeOption[];
  onClose: () => void;
  onSave: (values: {
    division_id: string;
    project_id: string | null;
    profile_id: string | null;
    kind: RecurringKind;
    cadence: RecurringCadence;
    label: string;
    vendor: string | null;
    amount_paise: number;
    starts_on: string;
    ends_on: string | null;
    status: RecurringStatus;
    notes: string | null;
  }) => Promise<{ ok: true } | { error: string }>;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [vals, setVals] = useState<Draft>(() => toDraft(initial, divisions));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useDismiss(dialogRef, onClose);

  const projectOptions = useMemo(
    () => projects.filter((project) => project.division_id === vals.division_id),
    [projects, vals.division_id],
  );

  const employeeOptions = useMemo(
    () => employees.filter((employee) => employee.is_active),
    [employees],
  );

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setVals((current) => ({ ...current, [key]: value }));
  }

  function onKindChange(kind: RecurringKind) {
    setVals((current) => ({
      ...current,
      kind,
      cadence: kind === "salary" ? "monthly" : current.cadence,
      vendor: kind === "salary" ? "" : current.vendor,
      profile_id: kind === "salary" ? current.profile_id : "",
    }));
  }

  function onEmployeeChange(profileId: string) {
    const employee = employeeOptions.find((item) => item.id === profileId);
    setVals((current) => ({
      ...current,
      profile_id: profileId,
      label: current.label.trim() ? current.label : (employee?.full_name ?? employee?.email ?? current.label),
    }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);

    const amount_paise = Math.round(Number(vals.amount || 0) * 100);
    if (!(amount_paise > 0)) {
      setErr("Enter an amount greater than zero.");
      return;
    }

    setBusy(true);
    const res = await onSave({
      division_id: vals.division_id,
      project_id: vals.project_id || null,
      profile_id: vals.kind === "salary" ? vals.profile_id || null : null,
      kind: vals.kind,
      cadence: vals.kind === "salary" ? "monthly" : vals.cadence,
      label: vals.label,
      vendor: vals.kind === "subscription" ? vals.vendor || null : null,
      amount_paise,
      starts_on: vals.starts_on,
      ends_on: vals.ends_on || null,
      status: vals.status,
      notes: vals.notes || null,
    });

    if ("error" in res) {
      setBusy(false);
      setErr(res.error);
      return;
    }

    onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={initial ? "Edit recurring payment" : "Add recurring payment"}>
      <div className="modal recurring-modal" ref={dialogRef} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <h3>{initial ? "Edit recurring payment" : "Add recurring payment"}</h3>
        <form onSubmit={submit}>
          <div className="recurring-form-grid">
            <div className="field">
              <label className="label" htmlFor="rp-kind">Type</label>
              <select id="rp-kind" className="select" value={vals.kind} onChange={(e) => onKindChange(e.target.value as RecurringKind)}>
                <option value="salary">Salary</option>
                <option value="subscription">Subscription</option>
              </select>
            </div>

            <div className="field">
              <label className="label" htmlFor="rp-status">Status</label>
              <select id="rp-status" className="select" value={vals.status} onChange={(e) => set("status", e.target.value as RecurringStatus)}>
                <option value="active">Active</option>
                <option value="ended">Ended</option>
              </select>
            </div>

            <div className="field">
              <label className="label" htmlFor="rp-label">{vals.kind === "salary" ? "Payroll label" : "Subscription name"}</label>
              <input id="rp-label" className="input" value={vals.label} onChange={(e) => set("label", e.target.value)} placeholder={vals.kind === "salary" ? "e.g. Product team payroll" : "e.g. Adobe CC"} required />
            </div>

            {vals.kind === "salary" ? (
              <div className="field">
                <label className="label" htmlFor="rp-profile">Employee</label>
                <select id="rp-profile" className="select" value={vals.profile_id} onChange={(e) => onEmployeeChange(e.target.value)} required>
                  <option value="">Pick an employee</option>
                  {employeeOptions.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.full_name ?? employee.email}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="field">
                <label className="label" htmlFor="rp-vendor">Vendor</label>
                <input id="rp-vendor" className="input" value={vals.vendor} onChange={(e) => set("vendor", e.target.value)} placeholder="Optional vendor or payee" />
              </div>
            )}

            <div className="field">
              <label className="label" htmlFor="rp-amount">{vals.kind === "salary" ? "Monthly salary" : "Recurring amount"}</label>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "var(--text-dim)", fontSize: 13 }}>Rs</span>
                <input id="rp-amount" type="number" inputMode="decimal" min="0" step="0.01" className="input" style={{ paddingLeft: 28 }} value={vals.amount} onChange={(e) => set("amount", e.target.value)} placeholder="0" required />
              </div>
            </div>

            <div className="field">
              <label className="label" htmlFor="rp-cadence">Cadence</label>
              <select id="rp-cadence" className="select" value={vals.kind === "salary" ? "monthly" : vals.cadence} onChange={(e) => set("cadence", e.target.value as RecurringCadence)} disabled={vals.kind === "salary"}>
                <option value="monthly">Monthly</option>
                <option value="annual">Annual</option>
              </select>
            </div>

            <div className="field">
              <label className="label" htmlFor="rp-division">Division</label>
              <select id="rp-division" className="select" value={vals.division_id} onChange={(e) => setVals((current) => ({ ...current, division_id: e.target.value, project_id: "" }))}>
                {divisions.map((division) => (
                  <option key={division.id} value={division.id}>
                    {division.name.replace(/^Sthyra\s+/, "")}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label className="label" htmlFor="rp-project">Project</label>
              <select id="rp-project" className="select" value={vals.project_id} onChange={(e) => set("project_id", e.target.value)}>
                <option value="">None</option>
                {projectOptions.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label className="label" htmlFor="rp-starts">Starts on</label>
              <input id="rp-starts" type="date" className="input" value={vals.starts_on} onChange={(e) => set("starts_on", e.target.value)} required />
            </div>

            <div className="field">
              <label className="label" htmlFor="rp-ends">Ends on</label>
              <input id="rp-ends" type="date" className="input" value={vals.ends_on} onChange={(e) => set("ends_on", e.target.value)} />
            </div>

            <div className="field recurring-form-span">
              <label className="label" htmlFor="rp-notes">Notes</label>
              <textarea id="rp-notes" className="textarea" value={vals.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Optional note for payroll cadence, owner, renewal context, etc." />
            </div>
          </div>

          <div className="fhint" style={{ marginBottom: 14 }}>
            {vals.kind === "salary"
              ? "Salary accrues daily from the start date until today using the monthly amount."
              : "Subscriptions can run monthly or yearly. Annual items still show a monthly equivalent in the dashboard."}
          </div>

          {err && <div className="form-err" role="alert">{err}</div>}

          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="submit" className="btn" disabled={busy} style={{ opacity: busy ? 0.7 : 1 }}>{busy ? "Saving..." : initial ? "Save changes" : "Create recurring item"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
