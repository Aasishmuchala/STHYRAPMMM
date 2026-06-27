"use client";

import { useMemo, useRef, useState } from "react";
import { useDismiss } from "@/lib/useDismiss";
import { beginToast, finishToast } from "@/lib/client-toast";
import type { DivisionOpt, ProjectOpt } from "@/lib/tasks-types";
import { csvObjects } from "@/lib/csvParse";
import { downloadCsv, toCsv } from "@/lib/csv";

type ImportRow = {
  division_id: string;
  project_id: string | null;
  kind: "revenue" | "cost" | "invoice";
  direction: "in" | "out";
  amount_paise: number;
  category: string | null;
  status: "draft" | "pending" | "cleared" | "void";
  occurred_on: string;
  counterparty: string | null;
  note: string | null;
};

type PreviewRow = ImportRow & {
  division_label: string;
  project_label: string;
};

function normalizeKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

function firstValue(row: Record<string, string>, keys: string[]) {
  for (const key of keys) {
    const match = Object.entries(row).find(([header]) => normalizeKey(header) === key);
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return "";
}

function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/[,\s]/g, "").replace(/[Rr][Ss]\.?/g, "").replace(/[^\d.-]/g, "");
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

function normalizeDirection(raw: string, amount: number): "in" | "out" | null {
  const value = normalizeKey(raw);
  if (["in", "income", "credit", "revenue"].includes(value)) return "in";
  if (["out", "expense", "debit", "cost"].includes(value)) return "out";
  if (amount < 0) return "out";
  return null;
}

function normalizeKind(raw: string, direction: "in" | "out"): "revenue" | "cost" | "invoice" {
  const value = normalizeKey(raw);
  if (value === "invoice") return "invoice";
  if (["revenue", "income"].includes(value)) return "revenue";
  if (["cost", "expense"].includes(value)) return "cost";
  return direction === "in" ? "revenue" : "cost";
}

function normalizeStatus(raw: string): "draft" | "pending" | "cleared" | "void" | null {
  const value = normalizeKey(raw);
  if (!value) return "cleared";
  if (["draft", "pending", "cleared", "void"].includes(value)) return value as "draft" | "pending" | "cleared" | "void";
  return null;
}

export function CsvImportModal({
  divisions,
  projects,
  onClose,
  onImport,
}: {
  divisions: DivisionOpt[];
  projects: ProjectOpt[];
  onClose: () => void;
  onImport: (fileName: string, rows: ImportRow[]) => Promise<{ ok: true; imported: number } | { error: string }>;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [parsedRows, setParsedRows] = useState<ImportRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useDismiss(dialogRef, onClose);

  const divisionMap = useMemo(() => {
    const pairs = new Map<string, DivisionOpt>();
    divisions.forEach((division) => {
      pairs.set(division.id, division);
      pairs.set(normalizeKey(division.slug), division);
      pairs.set(normalizeKey(division.name), division);
      pairs.set(normalizeKey(division.name.replace(/^Sthyra\s+/, "")), division);
    });
    return pairs;
  }, [divisions]);

  const projectLookup = useMemo(() => {
    const pairs = new Map<string, ProjectOpt[]>();
    projects.forEach((project) => {
      const keys = [project.id, normalizeKey(project.name)];
      keys.forEach((key) => {
        const list = pairs.get(key) ?? [];
        list.push(project);
        pairs.set(key, list);
      });
    });
    return pairs;
  }, [projects]);

  function downloadTemplate() {
    downloadCsv(
      "sthyra-transactions-template.csv",
      toCsv(
        ["date", "amount", "direction", "division", "project", "category", "status", "counterparty", "note"],
        [["2026-06-26", "42000", "out", "digital", "Website Revamp", "Software", "cleared", "Adobe", "Quarterly seat true-up"]],
      ),
    );
  }

  async function onFileChange(file: File | null) {
    setErr(null);
    setErrors([]);
    setParsedRows([]);
    setPreview([]);
    setFileName(file?.name ?? "");
    if (!file) return;

    const text = await file.text();
    const records = csvObjects(text);
    const nextRows: ImportRow[] = [];
    const nextPreview: PreviewRow[] = [];
    const nextErrors: string[] = [];

    records.forEach((record, index) => {
      const rowNo = index + 2;
      const rawDate = firstValue(record, ["date", "occurred_on", "occurred_on_date"]);
      const rawAmount = firstValue(record, ["amount", "amount_rs", "amount_inr", "amount_rupees"]);
      const rawDirection = firstValue(record, ["direction", "type"]);
      const rawDivision = firstValue(record, ["division", "division_slug", "division_name"]);
      const rawProject = firstValue(record, ["project", "project_name"]);
      const rawCategory = firstValue(record, ["category"]);
      const rawStatus = firstValue(record, ["status"]);
      const rawCounterparty = firstValue(record, ["counterparty", "vendor", "client"]);
      const rawKind = firstValue(record, ["kind"]);
      const rawNote = firstValue(record, ["note", "description", "memo"]);

      const amount = parseAmount(rawAmount);
      if (!rawDate) nextErrors.push(`Row ${rowNo}: date is required.`);
      if (amount === null) nextErrors.push(`Row ${rowNo}: amount is invalid.`);

      const division = divisionMap.get(normalizeKey(rawDivision)) ?? divisionMap.get(rawDivision);
      if (!division) nextErrors.push(`Row ${rowNo}: division "${rawDivision}" was not recognized.`);

      const direction = normalizeDirection(rawDirection, amount ?? 0);
      if (!direction) nextErrors.push(`Row ${rowNo}: direction must be in or out.`);

      const status = normalizeStatus(rawStatus);
      if (!status) nextErrors.push(`Row ${rowNo}: status must be draft, pending, cleared, or void.`);

      let projectId: string | null = null;
      let projectLabel = "";
      if (rawProject) {
        const matches = projectLookup.get(normalizeKey(rawProject)) ?? projectLookup.get(rawProject) ?? [];
        const scoped = division ? matches.filter((project) => project.division_id === division.id) : matches;
        if (scoped.length === 1) {
          const match = scoped[0];
          if (match) {
            projectId = match.id;
            projectLabel = match.name;
          }
        } else if (scoped.length === 0) {
          nextErrors.push(`Row ${rowNo}: project "${rawProject}" was not found in that division.`);
        } else {
          nextErrors.push(`Row ${rowNo}: project "${rawProject}" matches multiple divisions. Keep the division column accurate.`);
        }
      }

      if (nextErrors.some((message) => message.startsWith(`Row ${rowNo}:`))) return;

      const normalizedAmount = Math.round(Math.abs(amount ?? 0) * 100);
      const kind = normalizeKind(rawKind, direction!);
      const row: ImportRow = {
        division_id: division!.id,
        project_id: projectId,
        kind,
        direction: direction!,
        amount_paise: normalizedAmount,
        category: rawCategory || null,
        status: status!,
        occurred_on: rawDate,
        counterparty: rawCounterparty || null,
        note: rawNote || null,
      };
      nextRows.push(row);
      nextPreview.push({
        ...row,
        division_label: division!.name.replace(/^Sthyra\s+/, ""),
        project_label: projectLabel,
      });
    });

    setErrors(nextErrors);
    setParsedRows(nextRows);
    setPreview(nextPreview.slice(0, 6));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!fileName || parsedRows.length === 0) {
      setErr("Choose a CSV file with at least one valid row.");
      return;
    }
    if (errors.length > 0) {
      setErr("Fix the CSV issues before importing.");
      return;
    }

    setBusy(true);
    const toastId = beginToast("Importing CSV...");
    const res = await onImport(fileName, parsedRows);
    setBusy(false);
    if (!finishToast(res, { id: toastId, success: (result) => `${result.imported} row${result.imported === 1 ? "" : "s"} imported.` })) {
      setErr(res.error);
      return;
    }
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Import transactions CSV">
      <div className="modal csv-import-modal" ref={dialogRef} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <h3>Import ledger CSV</h3>
        <form onSubmit={submit}>
          <div className="field">
            <label className="label" htmlFor="csv-file">CSV file</label>
            <input id="csv-file" type="file" accept=".csv,text/csv" className="fileinput" onChange={(e) => onFileChange(e.target.files?.[0] ?? null)} />
          </div>

          <div className="csv-hint-row">
            <div className="fhint">Supported columns: date, amount, direction, division, project, category, status, counterparty, note, kind.</div>
            <button type="button" className="btn-ghost" onClick={downloadTemplate}>Template</button>
          </div>

          {preview.length > 0 && (
            <div className="csv-preview">
              <div className="csv-preview-head">
                <strong>{parsedRows.length}</strong> rows ready from {fileName}
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Division</th>
                    <th>Project</th>
                    <th>Direction</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, index) => (
                    <tr key={`${row.occurred_on}-${index}`}>
                      <td>{row.occurred_on}</td>
                      <td>{row.division_label}</td>
                      <td>{row.project_label || "-"}</td>
                      <td>{row.direction}</td>
                      <td>{Math.round(row.amount_paise / 100).toLocaleString("en-IN")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {errors.length > 0 && (
            <div className="form-err" role="alert">
              {errors.slice(0, 6).map((message) => <div key={message}>{message}</div>)}
              {errors.length > 6 && <div>...and {errors.length - 6} more rows with issues.</div>}
            </div>
          )}

          {err && <div className="form-err" role="alert">{err}</div>}

          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="submit" className="btn" disabled={busy} style={{ opacity: busy ? 0.7 : 1 }}>
              {busy ? "Importing..." : "Import rows"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
