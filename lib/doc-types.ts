export type Doc = {
  id: string; title: string; doc_type: string | null; status: string;
  body_md: string | null; storage_path: string | null; updated_at: string;
  division_id: string; division_name: string; division_slug: string;
};

export type DocKind = "note" | "file" | "link";

export function docKind(d: { storage_path: string | null }): DocKind {
  if (d.storage_path) return d.storage_path.startsWith("http") ? "link" : "file";
  return "note";
}

export function fileExt(path: string): string {
  const m = path.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "";
}

export const IMAGE_EXTS = ["png", "jpg", "jpeg", "gif", "webp", "svg"];
