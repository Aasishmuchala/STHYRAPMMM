export type RecurringKind = "salary" | "subscription";
export type RecurringCadence = "monthly" | "annual";
export type RecurringStatus = "active" | "ended";

export type RecurringPayment = {
  id: string;
  division_id: string;
  division_name: string;
  division_slug: string;
  project_id: string | null;
  project_name: string | null;
  profile_id: string | null;
  profile_name: string | null;
  profile_email: string | null;
  kind: RecurringKind;
  cadence: RecurringCadence;
  label: string;
  vendor: string | null;
  amount_paise: number;
  starts_on: string;
  ends_on: string | null;
  status: RecurringStatus;
  notes: string | null;
  created_at: string;
};

export type FinanceImportBatch = {
  id: string;
  file_name: string;
  row_count: number;
  imported_rows: number;
  status: "pending" | "completed" | "failed";
  error_summary: string | null;
  created_at: string;
};

export type RecurringCycle = {
  startOn: string;
  endOn: string;
  dueOn: string;
  cycleDays: number;
};

const DAY = 24 * 60 * 60 * 1000;

export function parseIsoDate(iso: string): Date {
  const parts = iso.split("-");
  const yearValue = Number(parts[0] ?? "1970");
  const monthValue = Number(parts[1] ?? "1");
  const dayValue = Number(parts[2] ?? "1");
  const year = Number.isFinite(yearValue) ? yearValue : 1970;
  const month = Number.isFinite(monthValue) ? monthValue : 1;
  const day = Number.isFinite(dayValue) ? dayValue : 1;
  return new Date(year, month - 1, day);
}

export function formatIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function clampDay(year: number, monthIndex: number, day: number): Date {
  const max = new Date(year, monthIndex + 1, 0).getDate();
  return new Date(year, monthIndex, Math.min(day, max));
}

export function addMonthsClamped(iso: string, months: number): string {
  const base = parseIsoDate(iso);
  const anchorDay = base.getDate();
  const targetMonth = base.getMonth() + months;
  const targetYear = base.getFullYear() + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  return formatIsoDate(clampDay(targetYear, normalizedMonth, anchorDay));
}

function shiftCycle(iso: string, cadence: RecurringCadence, count = 1): string {
  return addMonthsClamped(iso, cadence === "monthly" ? count : count * 12);
}

function dateDiffInDays(startOn: string, endOn: string): number {
  return Math.floor((parseIsoDate(endOn).getTime() - parseIsoDate(startOn).getTime()) / DAY);
}

function previousDay(iso: string): string {
  return formatIsoDate(new Date(parseIsoDate(iso).getTime() - DAY));
}

function minDate(a: string, b: string): string {
  return parseIsoDate(a).getTime() <= parseIsoDate(b).getTime() ? a : b;
}

function maxDate(a: string, b: string): string {
  return parseIsoDate(a).getTime() >= parseIsoDate(b).getTime() ? a : b;
}

function effectiveEnd(payment: Pick<RecurringPayment, "ends_on" | "status">, todayIso: string): string {
  // `status` is a UX hint (badge) — accrual math is bounded by `ends_on` and
  // `todayIso` only. The ternary that used to live here was a copy-paste trap.
  return payment.ends_on ? minDate(payment.ends_on, todayIso) : todayIso;
}

export function monthlyEquivalentPaisa(payment: Pick<RecurringPayment, "cadence" | "amount_paise">): number {
  return payment.cadence === "monthly" ? payment.amount_paise : Math.round(payment.amount_paise / 12);
}

export function recurringCyclesThrough(payment: Pick<RecurringPayment, "kind" | "cadence" | "starts_on" | "ends_on" | "status">, throughOn: string, limit = 240): RecurringCycle[] {
  const lastActiveOn = effectiveEnd(payment as Pick<RecurringPayment, "ends_on" | "status">, throughOn);
  if (parseIsoDate(lastActiveOn).getTime() < parseIsoDate(payment.starts_on).getTime()) return [];

  const cycles: RecurringCycle[] = [];
  let startOn = payment.starts_on;

  while (cycles.length < limit && parseIsoDate(startOn).getTime() <= parseIsoDate(lastActiveOn).getTime()) {
    const nextStart = shiftCycle(startOn, payment.cadence);
    const naturalEnd = previousDay(nextStart);
    const endOn = payment.ends_on ? minDate(naturalEnd, payment.ends_on) : naturalEnd;
    const dueOn = payment.kind === "salary" ? endOn : startOn;
    cycles.push({
      startOn,
      endOn,
      dueOn,
      cycleDays: dateDiffInDays(startOn, endOn) + 1,
    });
    startOn = nextStart;
  }

  return cycles;
}

export function accruedPaisaThrough(payment: Pick<RecurringPayment, "kind" | "cadence" | "amount_paise" | "starts_on" | "ends_on" | "status">, throughOn: string): number {
  const activeEnd = effectiveEnd(payment as Pick<RecurringPayment, "ends_on" | "status">, throughOn);
  if (parseIsoDate(activeEnd).getTime() < parseIsoDate(payment.starts_on).getTime()) return 0;

  return recurringCyclesThrough(payment, throughOn).reduce((total, cycle) => {
    const overlapStart = maxDate(cycle.startOn, payment.starts_on);
    const overlapEnd = minDate(cycle.endOn, activeEnd);
    if (parseIsoDate(overlapEnd).getTime() < parseIsoDate(overlapStart).getTime()) return total;
    const overlapDays = dateDiffInDays(overlapStart, overlapEnd) + 1;
    return total + Math.round((payment.amount_paise * overlapDays) / cycle.cycleDays);
  }, 0);
}

export function nextDueOn(payment: Pick<RecurringPayment, "kind" | "cadence" | "starts_on" | "ends_on" | "status">, todayIso: string): string | null {
  if (payment.status === "ended") return null;
  const cycles = recurringCyclesThrough(payment, shiftCycle(todayIso, payment.cadence, 2), 240);
  const todayTime = parseIsoDate(todayIso).getTime();
  const next = cycles.find((cycle) => parseIsoDate(cycle.dueOn).getTime() >= todayTime);
  return next?.dueOn ?? null;
}

export function activeRecurring(payment: Pick<RecurringPayment, "status" | "starts_on" | "ends_on">, todayIso: string): boolean {
  if (payment.status !== "active") return false;
  if (parseIsoDate(payment.starts_on).getTime() > parseIsoDate(todayIso).getTime()) return false;
  if (payment.ends_on && parseIsoDate(payment.ends_on).getTime() < parseIsoDate(todayIso).getTime()) return false;
  return true;
}

export function humanRecurringLabel(payment: Pick<RecurringPayment, "kind" | "label" | "profile_name" | "vendor">): string {
  if (payment.kind === "salary") return payment.profile_name ?? payment.label;
  return payment.label || payment.vendor || "Subscription";
}
