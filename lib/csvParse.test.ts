import { describe, it, expect } from "vitest";
import { parseCsv } from "./csvParse";

describe("parseCsv", () => {
  it("parses a simple comma-separated row", () => {
    const rows = parseCsv("a,b,c\n1,2,3");
    expect(rows).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });
  it("handles quoted fields with embedded commas", () => {
    const rows = parseCsv('a,b\n"hello, world",2');
    expect(rows).toEqual([
      ["a", "b"],
      ["hello, world", "2"],
    ]);
  });
  it("handles escaped double quotes", () => {
    const rows = parseCsv('a\n"She said ""hi"""');
    expect(rows).toEqual([
      ["a"],
      ['She said "hi"'],
    ]);
  });
  it("handles embedded newlines in quoted fields", () => {
    const rows = parseCsv('a,b\n"line 1\nline 2",x');
    expect(rows).toEqual([
      ["a", "b"],
      ["line 1\nline 2", "x"],
    ]);
  });
  it("handles CRLF line endings", () => {
    const rows = parseCsv("a,b\r\n1,2\r\n3,4");
    expect(rows).toEqual([["a", "b"], ["1", "2"], ["3", "4"]]);
  });
  it("strips UTF-8 BOM", () => {
    const rows = parseCsv("﻿a,b\n1,2");
    expect(rows).toEqual([["a", "b"], ["1", "2"]]);
  });
  it("returns ragged rows as-is (caller decides)", () => {
    const rows = parseCsv("a,b,c\n1,2");
    expect(rows).toEqual([
      ["a", "b", "c"],
      ["1", "2"],
    ]);
  });
  it("returns empty array for empty input", () => {
    expect(parseCsv("")).toEqual([]);
  });
});
