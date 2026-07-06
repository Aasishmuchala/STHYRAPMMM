import { describe, it, expect } from "vitest";
import { normalizeWhatsAppNumber } from "./phone";

describe("normalizeWhatsAppNumber", () => {
  it("prepends the default country code to a bare 10-digit Indian number", () => {
    expect(normalizeWhatsAppNumber("9876543210")).toBe("919876543210");
  });

  it("keeps a +country-code number, dropping the plus and separators", () => {
    expect(normalizeWhatsAppNumber("+919876543210")).toBe("919876543210");
    expect(normalizeWhatsAppNumber("+91 98765-43210")).toBe("919876543210");
    expect(normalizeWhatsAppNumber("+91 (98765) 43210")).toBe("919876543210");
  });

  it("accepts an already-normalized country-code number", () => {
    expect(normalizeWhatsAppNumber("919876543210")).toBe("919876543210");
  });

  it("handles a national trunk-prefixed number (0 + 10 digits)", () => {
    expect(normalizeWhatsAppNumber("09876543210")).toBe("919876543210");
  });

  it("handles the 00 international dialing prefix", () => {
    expect(normalizeWhatsAppNumber("00919876543210")).toBe("919876543210");
  });

  it("supports a non-Indian country code override", () => {
    expect(normalizeWhatsAppNumber("2015550123", "1")).toBe("12015550123");
  });

  it("returns null for empty / missing input", () => {
    expect(normalizeWhatsAppNumber("")).toBeNull();
    expect(normalizeWhatsAppNumber("   ")).toBeNull();
    expect(normalizeWhatsAppNumber(null)).toBeNull();
    expect(normalizeWhatsAppNumber(undefined)).toBeNull();
  });

  it("returns null for obviously-too-short junk", () => {
    expect(normalizeWhatsAppNumber("12345")).toBeNull();
    expect(normalizeWhatsAppNumber("abc")).toBeNull();
  });

  it("returns null for too-long junk (beyond E.164 15 digits)", () => {
    expect(normalizeWhatsAppNumber("9198765432101234567")).toBeNull();
  });
});
