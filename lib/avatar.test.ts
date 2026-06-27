import { describe, it, expect } from "vitest";
import { avatarBg } from "./avatar";

describe("avatarBg", () => {
  it("returns the same gradient for the same seed", () => {
    expect(avatarBg("seed-1")).toBe(avatarBg("seed-1"));
  });
  it("returns different gradients for different seeds", () => {
    expect(avatarBg("alpha")).not.toBe(avatarBg("beta"));
  });
  it("produces a CSS linear-gradient string", () => {
    expect(avatarBg("any")).toMatch(/linear-gradient/);
  });
  it("handles empty seed gracefully", () => {
    expect(avatarBg("")).toMatch(/linear-gradient/);
  });
  it("handles null seed gracefully", () => {
    expect(avatarBg(null)).toMatch(/linear-gradient/);
  });
});
