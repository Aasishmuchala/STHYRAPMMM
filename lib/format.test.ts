import { describe, it, expect } from "vitest";
import {
  inr,
  inrShort,
  pct,
  dueLabel,
  initials,
  fmtDate,
  fmtDateShort,
  fmtDuration,
  parseDuration,
} from "./format";

describe("inrShort", () => {
  // All money is stored as integer paise. 1 rupee = 100 paise.
  it("formats crores (>=1e7 rupees)", () => {
    // 50 crores = 50e7 rupees = 5e9 paise
    expect(inrShort(50_000_000_000)).toBe("₹50Cr");
  });
  it("formats lakhs (>=1e5 rupees)", () => {
    // 7.5 lakh rupees = 7.5e5 rupees = 7.5e7 paise
    expect(inrShort(750_000_00)).toBe("₹7.5L");
  });
  it("formats thousands (>=1e3 rupees)", () => {
    expect(inrShort(100 * 1500)).toBe("₹1.5k"); // 1500 rupees = 1.5k
  });
  it("formats whole rupees", () => {
    expect(inrShort(100 * 999)).toBe("₹999");
  });
  it("handles zero", () => {
    expect(inrShort(0)).toBe("₹0");
  });
  it("handles negative", () => {
    expect(inrShort(-100 * 2500)).toBe("-₹2.5k");
  });
  it("trims trailing zeros", () => {
    expect(inrShort(100 * 2000)).toBe("₹2k");
  });
});

describe("inr", () => {
  it("formats with Indian grouping", () => {
    expect(inr(100 * 92_34_567)).toBe("₹92,34,567");
  });
  it("handles zero", () => {
    expect(inr(0)).toBe("₹0");
  });
  it("rounds paise", () => {
    expect(inr(150)).toBe("₹2"); // 150 paise = 1.5 rupees -> rounds to 2
    expect(inr(149)).toBe("₹1");
  });
});

describe("pct", () => {
  it("formats with one decimal", () => {
    expect(pct(50)).toBe("50%");
    expect(pct(33.4)).toBe("33.4%");
  });
  it("trims trailing .0", () => {
    expect(pct(75.0)).toBe("75%");
  });
  it("handles NaN/Infinity", () => {
    expect(pct(NaN)).toBe("—");
    expect(pct(Infinity)).toBe("—");
  });
});

describe("dueLabel", () => {
  const today = new Date("2026-06-27T12:00:00");
  it("returns Overdue for past dates", () => {
    expect(dueLabel("2026-06-25", today)).toBe("Overdue");
  });
  it("returns Today for the same day", () => {
    expect(dueLabel("2026-06-27", today)).toBe("Today");
  });
  it("returns Tomorrow for the next day", () => {
    expect(dueLabel("2026-06-28", today)).toBe("Tomorrow");
  });
  it("returns day + month for further dates", () => {
    expect(dueLabel("2026-07-15", today)).toBe("15 Jul");
  });
  it("returns em-dash for null", () => {
    expect(dueLabel(null, today)).toBe("—");
  });
});

describe("initials", () => {
  it("takes first letter of two-word names", () => {
    expect(initials("Aasish Muchala", null)).toBe("AM");
  });
  it("takes first two letters of single-word name", () => {
    expect(initials("Priya", null)).toBe("PR");
  });
  it("falls back to email", () => {
    expect(initials(null, "aasish@sthyra.com")).toBe("AA");
  });
  it("returns ? when nothing", () => {
    expect(initials(null, null)).toBe("?");
  });
  it("uppercases", () => {
    expect(initials("alice cooper", null)).toBe("AC");
  });
});

describe("fmtDate", () => {
  it("formats ISO date in en-IN", () => {
    expect(fmtDate("2026-06-27")).toBe("27 Jun 2026");
  });
  it("formats Date in en-IN", () => {
    expect(fmtDate(new Date("2026-01-15T00:00:00"))).toBe("15 Jan 2026");
  });
  it("returns em-dash for null", () => {
    expect(fmtDate(null)).toBe("—");
  });
  it("returns em-dash for invalid", () => {
    expect(fmtDate("not-a-date")).toBe("—");
  });
});

describe("fmtDateShort", () => {
  it("formats without year", () => {
    expect(fmtDateShort("2026-06-27")).toBe("27 Jun");
  });
});

describe("fmtDuration / parseDuration", () => {
  it("formats minutes", () => {
    expect(fmtDuration(45)).toBe("45m");
  });
  it("formats hours", () => {
    expect(fmtDuration(120)).toBe("2h");
  });
  it("formats hours and minutes", () => {
    expect(fmtDuration(83)).toBe("1h 23m");
  });
  it("formats zero", () => {
    expect(fmtDuration(0)).toBe("0m");
  });
  it("parses 1h 30m", () => {
    expect(parseDuration("1h 30m")).toBe(90);
  });
  it("parses 45m", () => {
    expect(parseDuration("45m")).toBe(45);
  });
  it("parses 1.5h", () => {
    expect(parseDuration("1.5h")).toBe(90);
  });
  it("parses empty as 0", () => {
    expect(parseDuration("")).toBe(0);
  });
  it("roundtrips", () => {
    expect(parseDuration(fmtDuration(73))).toBe(73);
  });
});