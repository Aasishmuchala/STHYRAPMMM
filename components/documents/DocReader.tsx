"use client";

import { useEffect, useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useDismiss } from "@/lib/useDismiss";

// react-markdown (+ its remark/rehype tree, ~38KB) is the heaviest dependency in the app
// and only ever renders inside this drawer, behind a click + a 0.28s open animation. Loading
// it on demand keeps it out of every route's initial bundle with no perceptible difference.
const ReactMarkdown = dynamic(() => import("react-markdown"), { ssr: false });
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { createClient } from "@/lib/supabase/client";
import { updateDocument, deleteDocument } from "@/app/documents/actions";
import { docKind, fileExt, IMAGE_EXTS, type Doc } from "@/lib/doc-types";

export function DocReader({ doc, onClose }: { doc: Doc; onClose: () => void }) {
  const router = useRouter();
  const kind = docKind(doc);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loadingFile, setLoadingFile] = useState(kind === "file");
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(doc.title);
  const [body, setBody] = useState(doc.body_md ?? "");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const readerRef = useRef<HTMLElement>(null);
  useDismiss(readerRef, onClose);

  useEffect(() => {
    if (kind !== "file" || !doc.storage_path) return;
    let active = true;
    (async () => {
      const supabase = createClient();
      const { data, error } = await supabase.storage.from("documents").createSignedUrl(doc.storage_path!, 3600);
      if (active) {
        if (error) setErr(error.message);
        setSignedUrl(data?.signedUrl ?? null);
        setLoadingFile(false);
      }
    })();
    return () => { active = false; };
  }, [doc.storage_path, kind]);

  function saveNote() {
    start(async () => {
      const res = await updateDocument(doc.id, { title: title.trim() || doc.title, body_md: body || null });
      if ("error" in res) { setErr(res.error); return; }
      router.refresh();
      setEditing(false);
    });
  }
  function onDelete() {
    start(async () => {
      const res = await deleteDocument(doc.id, doc.storage_path);
      if ("error" in res) { setErr(res.error); setConfirmDel(false); return; }
      router.refresh();
      onClose();
    });
  }

  const ext = doc.storage_path ? fileExt(doc.storage_path) : "";
  const updated = new Date(doc.updated_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

  return (
    <>
    <div className="drawer-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={doc.title}>
      <aside className="drawer reader" ref={readerRef} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <span className="statuspill" style={{ textTransform: "capitalize" }}>{kind}</span>
          <button className="xbtn" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <article className="paper">
          <div className="doctag">{doc.division_name.replace(/^Sthyra\s+/, "")}{doc.doc_type ? ` / ${doc.doc_type}` : ""}</div>
          {editing ? (
            <input value={title} onChange={(e) => setTitle(e.target.value)} style={{ fontSize: 26, fontFamily: "var(--font-cormorant), serif", fontWeight: 600, color: "var(--oxblood)", background: "transparent", border: "none", borderBottom: "1px solid var(--paper-line)", width: "100%", margin: "8px 0", outline: "none" }} />
          ) : <h2>{doc.title}</h2>}
          <div className="byline">Updated {updated}</div>
          <hr />

          {kind === "note" && (editing ? (
            <textarea value={body} onChange={(e) => setBody(e.target.value)} style={{ minHeight: "44vh", width: "100%", fontFamily: "var(--font-mono), monospace", fontSize: 13, lineHeight: 1.6, background: "#fff", color: "var(--ink)", border: "1px solid var(--paper-line)", borderRadius: 8, padding: 14, outline: "none", resize: "vertical" }} />
          ) : (
            doc.body_md ? <div className="md"><ReactMarkdown>{doc.body_md}</ReactMarkdown></div> : <p style={{ color: "rgba(33,27,23,0.45)" }}>This note is empty.</p>
          ))}

          {kind === "file" && (
            loadingFile ? <p style={{ color: "rgba(33,27,23,0.45)" }}>Preparing a secure preview…</p> :
              signedUrl ? (
                IMAGE_EXTS.includes(ext) ? <img className="file-img" src={signedUrl} alt={doc.title} /> :
                  ext === "pdf" ? <iframe className="file-embed" src={signedUrl} title={doc.title} /> :
                    <a className="btn-paper" href={signedUrl} target="_blank" rel="noreferrer">Download{ext ? ` .${ext}` : " file"}</a>
              ) : <p style={{ color: "var(--oxblood)" }}>Could not load this file.</p>
          )}

          {kind === "link" && doc.storage_path && (
            <p><a className="btn-paper" href={doc.storage_path} target="_blank" rel="noreferrer">Open link ↗</a></p>
          )}
        </article>

        {err && <div className="form-err" style={{ marginTop: 12 }} role="alert">{err}</div>}

        <div className="reader-actions">
          <button className="btn-danger" onClick={() => setConfirmDel(true)} disabled={pending}>Delete</button>
          <div style={{ flex: 1 }} />
          {kind === "note" && (editing ? (
            <>
              <button className="btn-ghost" onClick={() => { setEditing(false); setBody(doc.body_md ?? ""); setTitle(doc.title); }} disabled={pending}>Cancel</button>
              <button className="btn" onClick={saveNote} disabled={pending}>{pending ? "Saving…" : "Save"}</button>
            </>
          ) : <button className="btn" onClick={() => setEditing(true)}>Edit</button>)}
        </div>
      </aside>
    </div>
    {confirmDel && (
      <ConfirmDialog
        title="Delete document"
        message={`Delete "${doc.title}"? This can be restored from the database.`}
        busy={pending}
        onConfirm={onDelete}
        onCancel={() => setConfirmDel(false)}
      />
    )}
    </>
  );
}
