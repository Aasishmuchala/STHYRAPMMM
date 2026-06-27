// Minimal, dependency-free CSV builder + browser download.

function escapeCell(v: string | number | null | undefined): string {
  const s = String(v ?? "");
  // Quote when the cell contains a comma, double-quote, CR, or LF.
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const lines = [headers.map(escapeCell).join(",")];
  for (const r of rows) lines.push(r.map(escapeCell).join(","));
  return lines.join("\r\n");
}

export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob(["﻿" + content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const rupees = (paise: number) => {
  // Two-decimal string for rupee display (used by the CSV export of money columns).
  if (!Number.isFinite(paise)) return "0.00";
  return (paise / 100).toFixed(2);
};
