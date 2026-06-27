import { describe, it, expect } from "vitest";
import {
  recurringCyclesThrough,
  accruedPaisaThrough,
  nextDueOn,
  activeRecurring,
  monthlyEquivalentPaisa,
  humanRecurringLabel,
  parseIsoDate,
  formatIsoDate,
  addMonthsClamped,
} from "./recurring";

describe("parseIsoDate / formatIsoDate", () => {
  it("roundtrips", () => {
    const iso = "2026-06-27";
    expect(formatIsoDate(parseIsoDate(iso))).toBe(iso);
  });
  it("handles Jan 31 + 1 month correctly (clamping)", () => {
    expect(addMonthsClamped("2026-01-31", 1)).toBe("2026-02-28");
  });
  it("handles Mar 31 + 1 month correctly", () => {
    expect(addMonthsClamped("2026-03-31", 1)).toBe("2026-04-30");
  });
  it("handles leap year Feb 29 + 12 months", () => {
    expect(addMonthsClamped("2024-02-29", 12)).toBe("2025-02-28");
  });
});

describe("monthlyEquivalentPaisa", () => {
  it("returns monthly as-is", () => {
    expect(monthlyEquivalentPaisa({ cadence: "monthly", amount_paise: 12000 })).toBe(12000);
  });
  it("divides annual by 12", () => {
    expect(monthlyEquivalentPaisa({ cadence: "annual", amount_paise: 120000 })).toBe(10000);
  });
});

describe("recurringCyclesThrough", () => {
  it("returns empty for payment that hasn't started", () => {
    const cycles = recurringCyclesThrough(
      { kind: "subscription", cadence: "monthly", starts_on: "2026-12-01", ends_on: null, status: "active" },
      "2026-06-27",
    );
    expect(cycles).toEqual([]);
  });
  it("produces monthly cycles between start and end", () => {
    const cycles = recurringCyclesThrough(
      { kind: "subscription", cadence: "monthly", starts_on: "2026-01-15", ends_on: null, status: "active" },
      "2026-04-30",
    );
    expect(cycles.length).toBe(4);
    expect(cycles[0]!.startOn).toBe("2026-01-15");
    // Each cycle ends the day before the next start (15th -> next start is 15th, so endOn is 14th of next month).
    expect(cycles[3]!.endOn).toBe("2026-05-14");
  });
  it("clamps monthly cycles at end_on", () => {
    const cycles = recurringCyclesThrough(
      { kind: "subscription", cadence: "monthly", starts_on: "2026-01-15", ends_on: "2026-02-28", status: "active" },
      "2026-12-31",
    );
    expect(cycles.length).toBe(2);
    expect(cycles[1]!.endOn).toBe("2026-02-28");
  });
  it("respects 240-cycle limit", () => {
    const cycles = recurringCyclesThrough(
      { kind: "subscription", cadence: "monthly", starts_on: "2000-01-01", ends_on: null, status: "active" },
      "3000-12-31",
    );
    expect(cycles.length).toBe(240);
  });
  it("annual cadence produces one cycle per year", () => {
    const cycles = recurringCyclesThrough(
      { kind: "subscription", cadence: "annual", starts_on: "2024-01-01", ends_on: null, status: "active" },
      "2026-12-31",
    );
    expect(cycles.length).toBe(3);
  });
});

describe("accruedPaisaThrough", () => {
  it("returns 0 for payment before start", () => {
    const accrued = accruedPaisaThrough(
      { kind: "subscription", cadence: "monthly", amount_paise: 12000, starts_on: "2026-12-01", ends_on: null, status: "active" },
      "2026-06-27",
    );
    expect(accrued).toBe(0);
  });
  it("prorates partial month", () => {
    // starts 2026-01-15, full month = 31 days. From 15 to 30 (16 days incl) = 16/31 of ₹120 = ~61.94 rupees = ~6194 paise
    const accrued = accruedPaisaThrough(
      { kind: "subscription", cadence: "monthly", amount_paise: 12000, starts_on: "2026-01-15", ends_on: null, status: "active" },
      "2026-01-30",
    );
    expect(accrued).toBeGreaterThan(5000);
    expect(accrued).toBeLessThan(7000);
  });
});

describe("nextDueOn", () => {
  it("returns null for ended payment", () => {
    expect(nextDueOn(
      { kind: "subscription", cadence: "monthly", starts_on: "2026-01-01", ends_on: "2026-03-01", status: "ended" },
      "2026-06-27",
    )).toBe(null);
  });
  it("returns the upcoming due date for active payment", () => {
    const next = nextDueOn(
      { kind: "salary", cadence: "monthly", starts_on: "2026-01-01", ends_on: null, status: "active" },
      "2026-06-15",
    );
    expect(next).not.toBe(null);
  });
});

describe("activeRecurring", () => {
  it("true for active payment in window", () => {
    expect(activeRecurring({ status: "active", starts_on: "2026-01-01", ends_on: null }, "2026-06-27")).toBe(true);
  });
  it("false for ended payment", () => {
    expect(activeRecurring({ status: "ended", starts_on: "2026-01-01", ends_on: null }, "2026-06-27")).toBe(false);
  });
  it("false before start", () => {
    expect(activeRecurring({ status: "active", starts_on: "2026-12-01", ends_on: null }, "2026-06-27")).toBe(false);
  });
  it("false after end", () => {
    expect(activeRecurring({ status: "active", starts_on: "2026-01-01", ends_on: "2026-03-01" }, "2026-06-27")).toBe(false);
  });
});

describe("humanRecurringLabel", () => {
  it("uses profile name for salary", () => {
    expect(humanRecurringLabel({ kind: "salary", label: "default", profile_name: "Priya", vendor: null })).toBe("Priya");
  });
  it("uses label for subscription", () => {
    expect(humanRecurringLabel({ kind: "subscription", label: "Figma seats", profile_name: null, vendor: null })).toBe("Figma seats");
  });
  it("falls back to vendor for subscription", () => {
    expect(humanRecurringLabel({ kind: "subscription", label: "", profile_name: null, vendor: "AWS" })).toBe("AWS");
  });
});
