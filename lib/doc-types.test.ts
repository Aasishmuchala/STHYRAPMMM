import { describe, it, expect } from "vitest";
import { docKind, fileExt } from "./doc-types";

describe("docKind", () => {
  it("returns 'note' for note docs", () => {
    expect(docKind({ doc_type: "note", storage_path: null })).toBe("note");
  });
  it("returns 'file' for storage_path-backed docs", () => {
    expect(docKind({ doc_type: null, storage_path: "/uploads/x.pdf" })).toBe("file");
  });
  it("returns 'link' for http(s) docs", () => {
    expect(docKind({ doc_type: null, storage_path: "https://example.com/x" })).toBe("link");
  });
  it("prefers explicit doc_type over storage_path", () => {
    expect(docKind({ doc_type: "note", storage_path: "https://x.com" })).toBe("note");
  });
});

describe("fileExt", () => {
  it("returns lowercase extension", () => {
    expect(fileExt("/uploads/foo.PDF")).toBe("pdf");
  });
  it("returns empty for no extension", () => {
    expect(fileExt("/uploads/foo")).toBe("");
  });
  it("returns empty for null", () => {
    expect(fileExt(null)).toBe("");
  });
  it("handles dotfile edge case", () => {
    expect(fileExt("/uploads/.gitignore")).toBe("gitignore");
  });
});
