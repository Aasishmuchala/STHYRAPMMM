import { describe, it, expect } from "vitest";
import { toCsv, rupees } from "./csv";

describe("toCsv", () => {
  it("emits header + rows", () => {
    const out = toCsv(["name", "amount"], [["Foo", 100]]);
    expect(out).toBe("name,amount\r\nFoo,100");
  });
  it("quotes fields with commas", () => {
    const out = toCsv(["name"], [["Hello, world"]]);
    expect(out).toBe('name\r\n"Hello, world"');
  });
  it("quotes and escapes embedded double quotes", () => {
    const out = toCsv(["name"], [['She said "hi"']]);
    expect(out).toBe('name\r\n"She said ""hi"""');
  });
  it("quotes fields with newlines", () => {
    const out = toCsv(["body"], [["line 1\nline 2"]]);
    expect(out).toBe('body\r\n"line 1\nline 2"');
  });
  it("quotes fields with CR", () => {
    const out = toCsv(["body"], [["line\rwith\rcr"]]);
    expect(out).toContain('"line\rwith\rcr"');
  });
  it("emits CRLF between rows", () => {
    const out = toCsv(["a"], [[1], [2]]);
    expect(out).toBe("a\r\n1\r\n2");
  });
  it("emits just the header for empty rows", () => {
    expect(toCsv(["a", "b"], [])).toBe("a,b");
  });
  it("renders undefined and null as empty", () => {
    const out = toCsv(["a", "b"], [[undefined, null]]);
    expect(out).toBe("a,b\r\n,");
  });
});

describe("rupees", () => {
  it("formats paise as rupees string", () => {
    expect(rupees(12000)).toBe("120.00");
    expect(rupees(100)).toBe("1.00");
    expect(rupees(0)).toBe("0.00");
  });
});