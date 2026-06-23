"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { useDismiss } from "@/lib/useDismiss";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { createTask, updateTask, deleteTask, setTaskStatus } from "@/app/tasks/actions";
import { STATUS_COLUMNS } from "@/lib/tasks-types";
import type {
  BoardTask, DivisionOpt, ProjectOpt, MemberOpt, TaskInput, TaskStatus, TaskPriority,
} from "@/lib/tasks-types";
import { dueLabel, initials } from "@/lib/format";
import { avatarBg } from "@/lib/avatar";

type Mode = "view" | "edit" | "create";

const prioMeta: Record<TaskPriority, { label: string; color: string }> = {
  high: { label: "High", color: "var(--danger)" },
  med: { label: "Medium", color: "var(--warning)" },
  low: { label: "Low", color: "var(--text-faint)" },
};

export function TaskDrawer({
  initialMode, task, presetStatus, divisions, projects, members, onClose,
}: {
  initialMode: Mode;
  task?: BoardTask;
  presetStatus?: TaskStatus;
  divisions: DivisionOpt[];
  projects: ProjectOpt[];
  members: MemberOpt[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [status, setStatusLocal] = useState<TaskStatus>(task?.status ?? presetStatus ?? "todo");
  const [confirmDel, setConfirmDel] = useState(false);
  const drawerRef = useRef<HTMLElement>(null);
  useDismiss(drawerRef, onClose);
  const today = new Date();

  const [form, setForm] = useState<TaskInput>({
    title: task?.title ?? "",
    division_id: task?.division_id ?? divisions[0]?.id ?? "",
    project_id: task?.project_id ?? null,
    assignee_id: task?.assignee_id ?? null,
    priority: task?.priority ?? "med",
    status: task?.status ?? presetStatus ?? "todo",
    due_date: task?.due_date ?? null,
    description: task?.description ?? null,
  });
  const set = <K extends keyof TaskInput>(k: K, v: TaskInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const projForDiv = projects.filter((p) => p.division_id === form.division_id);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    start(async () => {
      const res = mode === "create" ? await createTask(form) : await updateTask(task!.id, form);
      if ("error" in res) { setErr(res.error); return; }
      router.refresh();
      if (mode === "create") onClose();
      else { setStatusLocal(form.status); setMode("view"); }
    });
  }

  function quickStatus(s: TaskStatus) {
    if (!task || s === status) return;
    setStatusLocal(s);
    start(async () => {
      await setTaskStatus(task.id, s);
      router.refresh();
    });
  }

  function onDelete() {
    if (!task) return;
    start(async () => {
      const res = await deleteTask(task.id);
      if ("error" in res) { setErr(res.error); setConfirmDel(false); return; }
      router.refresh();
      onClose();
    });
  }

  const divName = (id: string) => divisions.find((d) => d.id === id)?.name.replace(/^Sthyra\s+/, "") ?? "—";
  const projName = (id: string | null) => (id ? projects.find((p) => p.id === id)?.name ?? "—" : "— None —");
  const memName = (id: string | null) => (id ? members.find((m) => m.id === id)?.name ?? "—" : "Unassigned");
  const colMeta = STATUS_COLUMNS.find((c) => c.key === status)!;

  return (
    <>
    <div className="drawer-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={mode === "create" ? "New task" : task?.title}>
      <aside className="drawer" ref={drawerRef} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <span className="statuspill"><span className="cdot" style={{ width: 7, height: 7, borderRadius: "50%", background: colMeta.dot }} />{colMeta.label}</span>
          <button className="xbtn" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {mode === "view" && task ? (
          <>
            <h2>{task.title}</h2>

            <div className="dmeta">
              <span className="k">Division</span><span className="v">{task.division_name.replace(/^Sthyra\s+/, "")}</span>
              <span className="k">Project</span><span className="v">{task.project_name ?? "—"}</span>
              <span className="k">Assignee</span>
              <span className="v">
                {task.assignee_name ? (
                  <>
                    <span className="tasg" style={{ background: avatarBg(task.assignee_name) }}>{initials(task.assignee_name, null)}</span>
                    {task.assignee_name}
                  </>
                ) : "Unassigned"}
              </span>
              <span className="k">Priority</span>
              <span className="v"><span className="tprio" style={{ background: prioMeta[task.priority].color }} />{prioMeta[task.priority].label}</span>
              <span className="k">Due</span><span className="v">{task.due_date ? dueLabel(task.due_date, today) : "—"}</span>
            </div>

            <div className="dsection">Move to</div>
            <div className="qstatus">
              {STATUS_COLUMNS.map((c) => (
                <button key={c.key} className={status === c.key ? "on" : ""} onClick={() => quickStatus(c.key)} disabled={pending}>{c.label}</button>
              ))}
            </div>

            {task.description && (
              <>
                <div className="dsection">Notes</div>
                <div className="dnotes">{task.description}</div>
              </>
            )}

            <div className="drawer-actions">
              <button className="btn-danger" onClick={() => setConfirmDel(true)} disabled={pending}>Delete</button>
              <div style={{ flex: 1 }} />
              <button className="btn" onClick={() => setMode("edit")}>Edit</button>
            </div>
            {err && <div className="form-err" role="alert" style={{ marginTop: 12 }}>{err}</div>}
          </>
        ) : (
          <form onSubmit={submit}>
            <div className="field">
              <label className="label" htmlFor="d-title">Title</label>
              <input id="d-title" className="input" value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="What needs doing?" autoFocus required />
            </div>
            <div className="field-row">
              <div className="field">
                <label className="label" htmlFor="d-div">Division</label>
                <select id="d-div" className="select" value={form.division_id} onChange={(e) => setForm((f) => ({ ...f, division_id: e.target.value, project_id: null }))}>
                  {divisions.map((d) => <option key={d.id} value={d.id}>{d.name.replace(/^Sthyra\s+/, "")}</option>)}
                </select>
              </div>
              <div className="field">
                <label className="label" htmlFor="d-proj">Project</label>
                <select id="d-proj" className="select" value={form.project_id ?? ""} onChange={(e) => set("project_id", e.target.value || null)}>
                  <option value="">— None —</option>
                  {projForDiv.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            </div>
            <div className="field-row">
              <div className="field">
                <label className="label" htmlFor="d-asg">Assignee</label>
                <select id="d-asg" className="select" value={form.assignee_id ?? ""} onChange={(e) => set("assignee_id", e.target.value || null)}>
                  <option value="">— Unassigned —</option>
                  {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
              <div className="field">
                <label className="label" htmlFor="d-due">Due date</label>
                <input id="d-due" type="date" className="input" value={form.due_date ?? ""} onChange={(e) => set("due_date", e.target.value || null)} />
              </div>
            </div>
            <div className="field-row">
              <div className="field">
                <label className="label" htmlFor="d-prio">Priority</label>
                <select id="d-prio" className="select" value={form.priority} onChange={(e) => set("priority", e.target.value as TaskPriority)}>
                  <option value="low">Low</option><option value="med">Medium</option><option value="high">High</option>
                </select>
              </div>
              <div className="field">
                <label className="label" htmlFor="d-status">Status</label>
                <select id="d-status" className="select" value={form.status} onChange={(e) => set("status", e.target.value as TaskStatus)}>
                  <option value="todo">To do</option><option value="doing">Doing</option><option value="review">Review</option><option value="done">Done</option>
                </select>
              </div>
            </div>
            <div className="field">
              <label className="label" htmlFor="d-desc">Notes</label>
              <textarea id="d-desc" className="textarea" value={form.description ?? ""} onChange={(e) => set("description", e.target.value || null)} placeholder="Optional details…" />
            </div>
            {err && <div className="form-err" role="alert">{err}</div>}
            <div className="modal-actions">
              {mode === "edit" && <button type="button" className="btn-danger" onClick={() => setConfirmDel(true)} disabled={pending}>Delete</button>}
              <button type="button" className="btn-ghost" onClick={() => (mode === "edit" ? setMode("view") : onClose())} disabled={pending}>Cancel</button>
              <button type="submit" className="btn" disabled={pending} style={{ opacity: pending ? 0.7 : 1 }}>{pending ? "Saving…" : mode === "create" ? "Create" : "Save"}</button>
            </div>
          </form>
        )}
      </aside>
    </div>
    {confirmDel && (
      <ConfirmDialog
        title="Delete task"
        message={`Delete "${task?.title}"? This can be restored from the database.`}
        busy={pending}
        onConfirm={onDelete}
        onCancel={() => setConfirmDel(false)}
      />
    )}
    </>
  );
}
