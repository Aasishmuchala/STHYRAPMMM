import { describe, it, expect } from "vitest";
import {
  ALLOWED_THEMES,
  isAllowedTheme,
  normalizeAccentHex,
  buildAccentStyleVars,
  buildAppearanceStyleVars,
} from "./appearance";

describe("ALLOWED_THEMES", () => {
  it("contains the four light themes", () => {
    expect(ALLOWED_THEMES).toContain("slate");
    expect(ALLOWED_THEMES).toContain("daybreak");
    expect(ALLOWED_THEMES).toContain("mist");
    expect(ALLOWED_THEMES).toContain("harbor");
  });
  it("contains the four dark themes (audit F1.1 — was previously unreachable)", () => {
    expect(ALLOWED_THEMES).toContain("nyradna");
    expect(ALLOWED_THEMES).toContain("midnight");
    expect(ALLOWED_THEMES).toContain("carbon");
    expect(ALLOWED_THEMES).toContain("oxblood");
  });
});

describe("isAllowedTheme", () => {
  it("accepts known themes", () => {
    expect(isAllowedTheme("slate")).toBe(true);
    expect(isAllowedTheme("oxblood")).toBe(true);
  });
  it("rejects unknown themes", () => {
    expect(isAllowedTheme("garbage")).toBe(false);
  });
  it("rejects null/undefined", () => {
    expect(isAllowedTheme(null)).toBe(false);
    expect(isAllowedTheme(undefined)).toBe(false);
    expect(isAllowedTheme("")).toBe(false);
  });
});

describe("normalizeAccentHex", () => {
  it("lowercases 6-digit hex", () => {
    expect(normalizeAccentHex("#FF00AA")).toBe("#ff00aa");
  });
  it("expands 3-digit short form", () => {
    expect(normalizeAccentHex("#abc")).toBe("#aabbcc");
  });
  it("rejects invalid hex", () => {
    expect(normalizeAccentHex("not-a-color")).toBe(null);
    expect(normalizeAccentHex("#xyzxyz")).toBe(null);
    expect(normalizeAccentHex("")).toBe(null);
  });
  it("accepts null/undefined", () => {
    expect(normalizeAccentHex(null)).toBe(null);
    expect(normalizeAccentHex(undefined)).toBe(null);
  });
  it("trims whitespace", () => {
    expect(normalizeAccentHex("  #00ff00  ")).toBe("#00ff00");
  });
});

describe("buildAccentStyleVars", () => {
  it("returns empty object for invalid accent", () => {
    expect(buildAccentStyleVars(null)).toEqual({});
    expect(buildAccentStyleVars("not-a-color")).toEqual({});
  });
  it("emits all six CSS vars for valid hex", () => {
    const vars = buildAccentStyleVars("#6b1f2a");
    expect(vars["--user-accent"]).toBe("#6b1f2a");
    expect(vars["--accent"]).toBe("#6b1f2a");
    expect(vars["--accent-ink"]).toMatch(/^#([0-9a-f]{3}){1,2}$/);
    expect(vars["--accent-soft"]).toMatch(/^#[0-9a-f]{6}24$/);
  });
  it("picks light ink for very light accents", () => {
    expect(buildAccentStyleVars("#ffffff")["--accent-ink"]).toBe("#0b1220");
  });
  it("picks dark ink for very dark accents", () => {
    expect(buildAccentStyleVars("#000000")["--accent-ink"]).toBe("#ffffff");
  });
});

describe("buildAppearanceStyleVars", () => {
  it("includes wallpaper and accent", () => {
    const vars = buildAppearanceStyleVars("https://example.com/img.jpg", "#ff0000");
    expect((vars as Record<string, string>)["--wallpaper-image"]).toBe("https://example.com/img.jpg");
    expect((vars as Record<string, string>)["--accent"]).toBe("#ff0000");
  });
  it("omits wallpaper when null", () => {
    const vars = buildAppearanceStyleVars(null, "#ff0000");
    expect((vars as Record<string, string>)["--wallpaper-image"]).toBeUndefined();
    expect((vars as Record<string, string>)["--accent"]).toBe("#ff0000");
  });
});
