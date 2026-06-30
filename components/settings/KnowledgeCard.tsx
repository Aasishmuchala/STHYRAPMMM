"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { beginToast, finishToast } from "@/lib/client-toast";
import { addKnowledge, deleteKnowledge } from "@/app/settings/knowledge-actions";
import { IconX } from "@/components/icons";

export type KnowledgeEntry = { id: string; title: string; body: string; tags: string[] };

export function KnowledgeCard({ entries }: { entries: KnowledgeEntry[] }) {
  const router = useRouter();
  const [, start] = useTransition();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tags, setTags] = useState("");
  const [err, setErr] = useState<string | null>(null);

  function add() {
    setErr(null);
    if (!title.trim() || !body.trim()) {
      setErr("Add a title and body.");
      return;
    }
    start(async () => {
      const toastId = beginToast("Adding knowledge…");
      const res = await addKnowledge(title, body, tags);
      if (!finishToast(res, { id: toastId, success: "Knowledge added." })) {
        setErr(res.error);
        return;
      }
      setTitle("");
      setBody("");
      setTags("");
      router.refresh();
    });
  }

  function remove(id: string) {
    start(async () => {
      const toastId = beginToast("Removing…");
      const res = await deleteKnowledge(id);
      if (!finishToast(res, { id: toastId, success: "Removed." })) {
        setErr(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="set-card">
      <h3>Assistant knowledge base</h3>
      <p className="sub">
        Facts, standards, and SOPs (e.g. your ArchViz pipeline, V-Ray settings, naming conventions). The assistant
        searches these and uses the most relevant ones to ground its answers and task breakdowns.
      </p>

      <div className="field">
        <label className="label" htmlFor="k-title">Title</label>
        <input id="k-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Studio V-Ray render settings" />
      </div>
      <div className="field">
        <label className="label" htmlFor="k-body">Knowledge</label>
        <textarea id="k-body" className="input" rows={4} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write the standard, process, or fact the assistant should know…" />
      </div>
      <div className="field">
        <label className="label" htmlFor="k-tags">Tags (comma-separated)</label>
        <input id="k-tags" className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="archviz, vray, rendering" />
      </div>
      {err && <div className="form-err" style={{ marginTop: 4 }}>{err}</div>}
      <div className="modal-actions">
        <button className="btn" onClick={add}>Add to knowledge base</button>
      </div>

      <div className="kb-list">
        {entries.length === 0 ? (
          <p className="sub" style={{ margin: 0 }}>No entries yet.</p>
        ) : (
          entries.map((e) => (
            <div className="kb-item" key={e.id}>
              <div className="grow">
                <div className="kb-title">{e.title}</div>
                <div className="kb-body">{e.body}</div>
                {e.tags.length > 0 && (
                  <div className="kb-tags">{e.tags.map((t) => <span key={t} className="kb-tag">{t}</span>)}</div>
                )}
              </div>
              <button className="kb-del" aria-label="Delete" onClick={() => remove(e.id)}>
                <IconX size={14} />
              </button>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
