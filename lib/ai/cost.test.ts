import { describe, it, expect } from "vitest";
import { costInr, fmtInr, MODEL_RATES } from "./cost";

describe("MODEL_RATES", () => {
  it("has rates for all supported models", () => {
    expect(MODEL_RATES["claude-opus-4-8"]).toBeDefined();
    expect(MODEL_RATES["claude-opus-4-7"]).toBeDefined();
    expect(MODEL_RATES["claude-opus-4-6"]).toBeDefined();
    expect(MODEL_RATES["claude-sonnet-4-6"]).toBeDefined();
    expect(MODEL_RATES["claude-haiku-4-5-20251001"]).toBeDefined();
  });
});

describe("costInr", () => {
  it("returns 0 for zero usage", () => {
    expect(costInr("claude-opus-4-8", { input_tokens: 0, output_tokens: 0 })).toBe(0);
  });
  it("returns 0 for unknown model", () => {
    expect(costInr("gpt-99", { input_tokens: 1000, output_tokens: 1000 })).toBe(0);
  });
  it("computes cost for opus-4-8", () => {
    // 1M input tokens at 15 USD/M, 1M output at 75 USD/M -> 90 USD total
    // At ~84 INR/USD = 7560 INR
    const cost = costInr("claude-opus-4-8", { input_tokens: 1_000_000, output_tokens: 1_000_000 });
    expect(cost).toBeGreaterThan(0);
    expect(cost).toBeLessThan(10000);
  });
  it("scales linearly", () => {
    const a = costInr("claude-sonnet-4-6", { input_tokens: 1000, output_tokens: 0 });
    const b = costInr("claude-sonnet-4-6", { input_tokens: 2000, output_tokens: 0 });
    expect(b).toBeCloseTo(a * 2, 6);
  });
});

describe("fmtInr", () => {
  it("formats integer INR with ₹ prefix", () => {
    expect(fmtInr(1234)).toMatch(/^₹1,234/);
  });
  it("formats zero", () => {
    expect(fmtInr(0)).toMatch(/^₹0/);
  });
  it("handles null/undefined", () => {
    expect(fmtInr(null)).toMatch(/^₹0/);
  });
});
