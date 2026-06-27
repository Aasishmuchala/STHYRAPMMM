import { describe, it, expect, vi } from "vitest";
import { isErrorResult, finishToast } from "./client-toast";

// react-hot-toast is auto-mocked at module level below
vi.mock("react-hot-toast", () => ({
  default: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(() => "toast-id"),
    dismiss: vi.fn(),
  }),
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(() => "toast-id"),
    dismiss: vi.fn(),
  },
}));

describe("isErrorResult", () => {
  it("detects Result type with error key", () => {
    expect(isErrorResult({ error: "x" })).toBe(true);
    expect(isErrorResult({ ok: true })).toBe(false);
  });
});

describe("finishToast", () => {
  it("returns true for ok result and calls toast.success", () => {
    const res = finishToast({ ok: true }, { id: "1", success: "Saved." });
    expect(res).toBe(true);
  });
  it("returns false for error result and calls toast.error", () => {
    const res = finishToast({ error: "boom" }, { id: "1", success: "Saved.", error: "Failed." });
    expect(res).toBe(false);
  });
});
