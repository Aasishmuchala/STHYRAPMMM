"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useDismiss } from "@/lib/useDismiss";
import { createClient } from "@/lib/supabase/client";
import { createDocument } from "@/app/documents/actions";
import { beginToast, finishToast } from "@/lib/client-toast";
import type { DivisionOpt } from "@/lib/tasks-types";
import type { DocKind } from "@/lib/doc-types";

const TITLES: Record<DocKind, string> = { note: "New note", file: "Upload file", link: "Add link" };

export function DocModal({ kind, divisions, onClose }: { kind: DocKind; divisions: DivisionOpt[]; onClose: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [divisionId, setDivisionId] = useState(divisions[0]?.id ?? "");
  const [docType, setDocType] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useDismiss(dialogRef, onClose);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    const toastId = beginToast(kind === "file" ? "Uploading document..." : "Creating document...");
    try {
      let storage_path: string | null = null;
      let body_md: string | null = null;

      if (kind === "note") {
        body_md = body.trim() || null;
      } else if (kind === "link") {
        const u = url.trim();
        if (!u) { finishToast({ error: "Enter a URL" }, { id: toastId, success: "" }); setErr("Enter a URL"); setBusy(false); return; }
        storage_path = u.startsWith("http") ? u : `https://${u}`;
      } else if (kind === "file") {
        if (!file) { finishToast({ error: "Choose a file" }, { id: toastId, success: "" }); setErr("Choose a file"); setBusy(false); return; }
        const supabase = createClient();
        const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${divisionId}/${crypto.randomUUID()}-${safe}`;
        const { error: upErr } = await supabase.storage.from("documents").upload(path, file, { upsert: false });
        if (upErr) { finishToast({ error: upErr.message }, { id: toastId, success: "" }); setErr(upErr.message); setBusy(false); return; }
        storage_path = path;
      }

      const res = await createDocument({ division_id: divisionId, title, doc_type: docType.trim() || null, status: "active", body_md, storage_path });
      if (!finishToast(res, { id: toastId, success: kind === "file" ? "Document uploaded." : "Document created." })) { setErr(res.error); setBusy(false); return; }
      router.refresh();
      onClose();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Something went wrong";
      finishToast({ error: message }, { id: toastId, success: "" });
      setErr(message);
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={TITLES[kind]}>
      <div className="modal" ref={dialogRef} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <h3>{TITLES[kind]}</h3>
        <form onSubmit={submit}>
          <div className="field">
            <label className="label" htmlFor="doc-title">Title</label>
            <input id="doc-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Document title" autoFocus required />
          </div>
          <div className="field-row">
            <div className="field">
              <label className="label" htmlFor="doc-div">Division</label>
              <select id="doc-div" className="select" value={divisionId} onChange={(e) => setDivisionId(e.target.value)}>
                {divisions.map((d) => <option key={d.id} value={d.id}>{d.name.replace(/^Sthyra\s+/, "")}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="label" htmlFor="doc-type">Type</label>
              <input id="doc-type" className="input" value={docType} onChange={(e) => setDocType(e.target.value)} placeholder="SOP, Contract, Dossier…" />
            </div>
          </div>

          {kind === "note" && (
            <div className="field">
              <label className="label" htmlFor="doc-body">Markdown</label>
              <textarea id="doc-body" className="textarea" style={{ minHeight: 220, fontFamily: "var(--font-mono), monospace", fontSize: 13 }} value={body} onChange={(e) => setBody(e.target.value)} placeholder={"# Heading\n\nWrite in **markdown**. Lists, `code`, > quotes all render on the paper canvas."} />
            </div>
          )}
          {kind === "link" && (
            <div className="field">
              <label className="label" htmlFor="doc-url">URL</label>
              <input id="doc-url" className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
            </div>
          )}
          {kind === "file" && (
            <div className="field">
              <label className="label" htmlFor="doc-file">File</label>
              <input id="doc-file" type="file" className="fileinput" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              <span className="fhint">Stored privately. Access is signed-URL only, scoped to division members.</span>
            </div>
          )}

          {err && <div className="form-err" role="alert">{err}</div>}
          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="submit" className="btn" disabled={busy} style={{ opacity: busy ? 0.7 : 1 }}>{busy ? "Saving…" : kind === "file" ? "Upload" : "Create"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
