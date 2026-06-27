"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { addComment, deleteComment, editComment } from "@/app/tasks/comments-actions";
import { beginToast, finishToast } from "@/lib/client-toast";

export type Comment = {
  id: string;
  task_id: string;
  author_id: string;
  author_name?: string | null;
  body_md: string;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
};

export function CommentsTab({
  taskId,
  comments,
  currentUserId,
}: {
  taskId: string;
  comments: Comment[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState("");
  const [busy, setBusy] = useState(false);

  async function post() {
    const body = input.trim();
    if (!body || busy) return;
    setBusy(true);
    const toastId = beginToast("Posting comment...");
    const res = await addComment(taskId, body);
    setBusy(false);
    if (!finishToast(res, { id: toastId, success: "Comment posted." })) return;
    setInput("");
    router.refresh();
  }

  async function save(id: string) {
    if (busy) return;
    const body = editingBody.trim();
    if (!body) return;
    setBusy(true);
    const toastId = beginToast("Saving...");
    const res = await editComment(id, body);
    setBusy(false);
    if (!finishToast(res, { id: toastId, success: "Saved." })) return;
    setEditingId(null);
    router.refresh();
  }

  async function remove(id: string) {
    if (busy) return;
    setBusy(true);
    const toastId = beginToast("Deleting...");
    const res = await deleteComment(id);
    setBusy(false);
    if (!finishToast(res, { id: toastId, success: "Deleted." })) return;
    router.refresh();
  }

  return (
    <div className="comments-tab">
      <div className="comments-list">
        {comments.length === 0 ? (
          <p className="sub" style={{ marginBottom: 12 }}>No comments yet. Start the conversation.</p>
        ) : (
          comments.map((c) => (
            <div className="comment" key={c.id}>
              <div className="comment-meta">
                <span className="comment-author">{c.author_name ?? "Member"}</span>
                <span className="comment-time mono">
                  {new Date(c.created_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  {c.edited_at ? " (edited)" : ""}
                </span>
              </div>
              {editingId === c.id ? (
                <div>
                  <textarea
                    className="input textarea"
                    rows={3}
                    value={editingBody}
                    onChange={(e) => setEditingBody(e.target.value)}
                  />
                  <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                    <button className="btn btn-sm" onClick={() => save(c.id)} disabled={busy}>Save</button>
                    <button className="btn-ghost btn-sm" onClick={() => setEditingId(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="comment-body">
                  {c.deleted_at ? (
                    <em style={{ color: "var(--text-faint)" }}>Comment deleted</em>
                  ) : (
                    <ReactMarkdown>{c.body_md}</ReactMarkdown>
                  )}
                </div>
              )}
              {!c.deleted_at && c.author_id === currentUserId && editingId !== c.id && (
                <div className="comment-actions">
                  <button
                    className="link"
                    onClick={() => { setEditingId(c.id); setEditingBody(c.body_md); }}
                  >Edit</button>
                  <button className="link danger" onClick={() => remove(c.id)}>Delete</button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
      <div className="comment-composer">
        <textarea
          className="input textarea"
          rows={3}
          placeholder="Add a comment. Markdown is supported."
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button className="btn" onClick={post} disabled={busy || !input.trim()}>Post</button>
      </div>
    </div>
  );
}