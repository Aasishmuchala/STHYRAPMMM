export type Doc = {
  id: string; title: string; doc_type: string | null; status: string;
  body_md: string | null; storage_path: string | null; updated_at: string;
  division_id: string; division_name: string; division_slug: string;
};

export type DocKind = "note" | "file" | "link";

export function docKind(d: { doc_type?: string | null; storage_path: string | null }): DocKind {
  // Explicit doc_type wins over storage_path so callers can force a "note" even
  // when a storage path is present.
  const t = d.doc_type?.toLowerCase();
  if (t === "note" || t === "file" || t === "link") return t;
  if (d.storage_path) return d.storage_path.startsWith("http") ? "link" : "file";
  return "note";
}

export function fileExt(path: string | null | undefined): string {
  if (!path) return "";
  const m = path.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m?.[1] ?? "";
}

export const IMAGE_EXTS = ["png", "jpg", "jpeg", "gif", "webp", "svg"];
