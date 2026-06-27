import { describe, it, expect } from "vitest";
import { isCompanyEmail, normalizeEmail, companyEmailDomain, getAllowedDomains } from "./companyEmail";

describe("isCompanyEmail", () => {
  it("accepts @sthyra.com addresses", () => {
    expect(isCompanyEmail("aasish@sthyra.com")).toBe(true);
    expect(isCompanyEmail("anyone@sthyra.com")).toBe(true);
  });
  it("accepts @sthyra.in addresses", () => {
    expect(isCompanyEmail("test@sthyra.in")).toBe(true);
  });
  it("rejects other domains", () => {
    expect(isCompanyEmail("test@gmail.com")).toBe(false);
    expect(isCompanyEmail("test@example.com")).toBe(false);
  });
  it("is case-insensitive", () => {
    expect(isCompanyEmail("Test@STHYRA.COM")).toBe(true);
  });
  it("trims whitespace", () => {
    expect(isCompanyEmail("  test@sthyra.com  ")).toBe(true);
  });
  it("rejects empty / null / undefined", () => {
    expect(isCompanyEmail("")).toBe(false);
    expect(isCompanyEmail(null)).toBe(false);
    expect(isCompanyEmail(undefined)).toBe(false);
  });
  it("does NOT accept hardcoded personal emails (audit 1.6 — security fix)", () => {
    // The previous code whitelisted "aasishmuchala@gmail.com" as a super-admin
    // backdoor. After the fix, no personal Gmail can sign in.
    expect(isCompanyEmail("aasishmuchala@gmail.com")).toBe(false);
    expect(isCompanyEmail("ANYONE@gmail.com")).toBe(false);
  });
});

describe("normalizeEmail", () => {
  it("lowercases", () => {
    expect(normalizeEmail("HELLO@sthyra.com")).toBe("hello@sthyra.com");
  });
  it("trims", () => {
    expect(normalizeEmail("  hi@sthyra.com  ")).toBe("hi@sthyra.com");
  });
});

describe("companyEmailDomain", () => {
  it("returns the primary domain", () => {
    expect(companyEmailDomain()).toBe("sthyra.com");
  });
});

describe("getAllowedDomains", () => {
  it("contains both company domains", () => {
    const domains = getAllowedDomains();
    expect(domains).toContain("sthyra.com");
    expect(domains).toContain("sthyra.in");
  });
});
