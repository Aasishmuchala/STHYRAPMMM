// Money is stored as integer paise (Rs 1 = 100 paise). Format to Indian short form.
export function inrShort(paise: number): string {
  const r = paise / 100;
  const abs = Math.abs(r);
  const sign = r < 0 ? "-" : "";
  if (abs >= 1e7) return `${sign}₹${trim(abs / 1e7, 2)}Cr`;
  if (abs >= 1e5) return `${sign}₹${trim(abs / 1e5, 1)}L`;
  if (abs >= 1e3) return `${sign}₹${trim(abs / 1e3, 1)}k`;
  return `${sign}₹${Math.round(abs).toLocaleString("en-IN")}`;
}

function trim(n: number, dp: number): string {
  return n.toFixed(dp).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

export function pct(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return `${n.toFixed(1).replace(/\.0$/, "")}%`;
}

// Exact Indian-grouped rupees from paise, e.g. 9200000 -> "₹92,000"
export function inr(paise: number): string {
  if (!Number.isFinite(paise)) return "₹0";
  return "₹" + Math.round(paise / 100).toLocaleString("en-IN");
}

// Short relative due label from an ISO date string, given "today".
export function dueLabel(iso: string | null, today: Date): string {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diff = Math.round((d.getTime() - t.getTime()) / 86400000);
  if (diff < 0) return "Overdue";
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return `${d.getDate()} ${MONTH_LABELS[d.getMonth()]}`;
}

export function initials(name: string | null, email: string | null): string {
  const src = (name || email || "?").trim();
  const parts = src.split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? src[0] ?? "?";
  const second = parts[1]?.[0] ?? src[1] ?? "";
  if (parts.length >= 2) return (first + second).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

// Single source of truth for date / month formatting (en-IN locale everywhere).
export const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

export const FULL_MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

export const DATE_FMT = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export const DATE_FMT_SHORT = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
});

export const DATETIME_FMT = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export const MONTH_LABEL_FORMATTER = new Intl.DateTimeFormat("en-IN", { month: "short" });
export const FULL_MONTH_FORMATTER = new Intl.DateTimeFormat("en-IN", { month: "long" });

/** Format an ISO date string ("2026-06-27") or Date as "27 Jun 2026" in en-IN. */
export function fmtDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value.length === 10 ? value + "T00:00:00" : value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return DATE_FMT.format(d);
}

/** Short: "27 Jun" — for compact UI (timelines, table columns). */
export function fmtDateShort(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value.length === 10 ? value + "T00:00:00" : value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return DATE_FMT_SHORT.format(d);
}

/** Format an ISO date string as a month label "Jun". */
export function fmtMonth(iso: string | null | undefined): string {
  if (!iso) return "";
  return MONTH_LABEL_FORMATTER.format(new Date(iso.length === 10 ? iso + "T00:00:00" : iso));
}

/** "1h 23m" duration formatter for time logs. */
export function fmtDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "0m";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** Parse a "1h 23m" / "23m" / "1.5h" string back to minutes. */
export function parseDuration(input: string): number {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return 0;
  const hoursMatch = trimmed.match(/^([\d.]+)\s*h/);
  const minsMatch = trimmed.match(/(\d+)\s*m/);
  const hours = hoursMatch?.[1] ? parseFloat(hoursMatch[1]) : 0;
  const mins = minsMatch?.[1] ? parseInt(minsMatch[1], 10) : 0;
  if (hoursMatch && !minsMatch) return Math.round(hours * 60);
  return Math.round(hours * 60 + mins);
}
