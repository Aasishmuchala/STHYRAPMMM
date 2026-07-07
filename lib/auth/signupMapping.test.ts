import { describe, it, expect } from "vitest";
import { isCompanyEmail, divisionSlugForEmail } from "./companyEmail";

describe("company domains (signup allowlist)", () => {
  it("allows the three company domains", () => {
    expect(isCompanyEmail("a@sthyra.com")).toBe(true);
    expect(isCompanyEmail("a@sthyradigital.com")).toBe(true);
    expect(isCompanyEmail("a@abhignaconstructions.com")).toBe(true);
  });
  it("still rejects outside domains", () => {
    expect(isCompanyEmail("a@gmail.com")).toBe(false);
    expect(isCompanyEmail("a@sthyra.co")).toBe(false);
  });
});

describe("divisionSlugForEmail", () => {
  it("maps each domain to its company division slug", () => {
    expect(divisionSlugForEmail("me@sthyra.com")).toBe("studios");
    expect(divisionSlugForEmail("me@sthyradigital.com")).toBe("digital");
    expect(divisionSlugForEmail("me@abhignaconstructions.com")).toBe("abhigna_constructions");
  });
  it("is case-insensitive and trims", () => {
    expect(divisionSlugForEmail("  ME@STHYRADIGITAL.COM ")).toBe("digital");
  });
  it("returns null for unmapped / invalid addresses", () => {
    expect(divisionSlugForEmail("me@sthyra.in")).toBe(null);
    expect(divisionSlugForEmail("not-an-email")).toBe(null);
    expect(divisionSlugForEmail("")).toBe(null);
  });
});
