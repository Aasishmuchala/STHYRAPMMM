"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  FiPlus,
  FiX,
  FiTarget,
  FiTrash2,
  FiCheck,
} from "react-icons/fi";
import {
  assignTasksToCycle,
  deleteProjectCycle,
  updateProjectCycle,
} from "@/app/tasks/actions";
import type { BoardTask, CycleOpt, CycleStatus, MemberOpt, TaskStage } from "@/lib/tasks-types";
import { initials } from "@/lib/format";
import { avatarBg } from "@/lib/avatar";
import { getTaskDisplayKey, ITEM_TYPE_META } from "./taskMeta";

const STATUS_META: Record<CycleStatus, { label: string; color: string }> = {
  planned: { label: "Planned", color: "#f59e0b" },
  active: { label: "Active", color: "#10b981" },
  completed: { label: "Completed", color: "#2563eb" },
};

const PRIORITY_COLOR: Record<string, string> = {
  highest: "var(--danger)",
  high: "var(--warning)",
  medium: "var(--accent)",
  low: "var(--text-dim)",
  lowest: "var(--text-faint)",
};

export function CycleDetail({
  cycle,
  projectTasks,
  otherCycles,
  members,
  stages,
  canManage,
  onCycleTasksChanged,
}: {
  cycle: CycleOpt;
  projectTasks: BoardTask[];
  otherCycles: CycleOpt[];
  members: MemberOpt[];
  stages: TaskStage[];
  canManage: boolean;
  onCycleTasksChanged?: (taskIds: string[], nextCycleId: string | null) => void;
}) {
  const router = useRouter();
  const [, start] = useTransition();
  const [busy, setBusy] = useState<null | string>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleteMoveTo, setDeleteMoveTo] = useState<string>("");

  // Local edits to cycle metadata. Save on blur/click rather than every keystroke.
  const [name, setName] = useState(cycle.name);
  const [goal, setGoal] = useState(cycle.goal ?? "");
  const [startsOn, setStartsOn] = useState(cycle.starts_on ?? "");
  const [endsOn, setEndsOn] = useState(cycle.ends_on ?? "");
  const [status, setStatus] = useState<CycleStatus>(cycle.status);
  const [dirty, setDirty] = useState(false);

  const memberName = (id: string | null) => members.find((m) => m.id === id)?.name ?? null;

  const cycleTasks = useMemo(
    () => projectTasks.filter((task) => task.cycle_id === cycle.id),
    [projectTasks, cycle.id],
  );
  const cycleTaskIds = useMemo(() => new Set(cycleTasks.map((t) => t.id)), [cycleTasks]);

  const isDone = (task: BoardTask) => stages.find((stage) => stage.id === task.status)?.is_done === true;
  const inProgress = cycleTasks.filter((task) => !isDone(task)).length;
  const completed = cycleTasks.filter(isDone).length;

  const availableTasks = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return projectTasks
      .filter((task) => !cycleTaskIds.has(task.id))
      .filter((task) => !q || task.title.toLowerCase().includes(q) || (task.assignee_name ?? "").toLowerCase().includes(q) || (task.item_type ?? "").includes(q))
      .sort((a, b) => {
        const ad = a.due_date ?? "9999-12-31";
        const bd = b.due_date ?? "9999-12-31";
        return ad.localeCompare(bd);
      })
      .slice(0, 200);
  }, [projectTasks, cycleTaskIds, filter]);

  function persistMetadata() {
    if (!canManage || !dirty) return;
    setError(null);
    start(async () => {
      const res = await updateProjectCycle(cycle.id, {
        name,
        goal: goal || null,
        starts_on: startsOn || null,
        ends_on: endsOn || null,
        status,
      });
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setDirty(false);
      router.refresh();
    });
  }

  async function removeFromCycle(taskId: string) {
    if (!canManage) return;
    setError(null);
    setBusy(taskId);
    const res = await assignTasksToCycle(cycle.id, [taskId], "remove");
    setBusy(null);
    if ("error" in res) setError(res.error);
    else {
      onCycleTasksChanged?.([taskId], null);
      router.refresh();
    }
  }

  async function addSelectedToCycle(taskIds: string[]) {
    if (!canManage || taskIds.length === 0) return;
    setError(null);
    setBusy("bulk-add");
    const res = await assignTasksToCycle(cycle.id, taskIds, "add");
    setBusy(null);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    setShowAdd(false);
    setFilter("");
    onCycleTasksChanged?.(taskIds, cycle.id);
    router.refresh();
  }

  async function confirmDelete() {
    setError(null);
    setBusy("delete");
    const res = await deleteProjectCycle(cycle.id, deleteMoveTo || null);
    setBusy(null);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    setShowDelete(false);
    router.refresh();
  }

  return (
    <article className="tasks-panel tasks-panel-span cycle-detail">
      <div className="tasks-panel-head cycle-detail-head">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="workspace-tag">Cycle</div>
          {canManage ? (
            <input
              className="cycle-name-input"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setDirty(true);
              }}
              onBlur={persistMetadata}
            />
          ) : (
            <h3>{cycle.name}</h3>
          )}
        </div>
        <div className="cycle-detail-meta">
          <span className="planning-status" style={{ background: `${STATUS_META[status].color}16`, color: STATUS_META[status].color }}>
            <FiTarget size={14} />
            {STATUS_META[status].label}
          </span>
          <span className="cycle-detail-counts">
            <strong>{completed}</strong>/<span>{cycleTasks.length}</span> done
          </span>
        </div>
      </div>

      {error && <div className="form-err" style={{ marginBottom: 12 }}>{error}</div>}

      <div className="cycle-edit-row">
        <label className="field" style={{ margin: 0 }}>
          <span className="label">Goal</span>
          <input
            className="input"
            value={goal}
            onChange={(e) => {
              setGoal(e.target.value);
              setDirty(true);
            }}
            onBlur={persistMetadata}
            placeholder="What should this cycle accomplish?"
            disabled={!canManage}
          />
        </label>
        <label className="field" style={{ margin: 0 }}>
          <span className="label">Start</span>
          <input
            type="date"
            className="input"
            value={startsOn}
            onChange={(e) => {
              setStartsOn(e.target.value);
              setDirty(true);
            }}
            onBlur={persistMetadata}
            disabled={!canManage}
          />
        </label>
        <label className="field" style={{ margin: 0 }}>
          <span className="label">End</span>
          <input
            type="date"
            className="input"
            value={endsOn}
            onChange={(e) => {
              setEndsOn(e.target.value);
              setDirty(true);
            }}
            onBlur={persistMetadata}
            disabled={!canManage}
          />
        </label>
        <label className="field" style={{ margin: 0 }}>
          <span className="label">Status</span>
          <select
            className="select"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as CycleStatus);
              setDirty(true);
            }}
            onBlur={persistMetadata}
            disabled={!canManage}
          >
            <option value="planned">Planned</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
          </select>
        </label>
        {dirty && canManage && (
          <button type="button" className="btn cycle-save-btn" onClick={persistMetadata}>
            <FiCheck size={14} />
            Save
          </button>
        )}
      </div>

      <div className="cycle-detail-toolbar">
        <div>
          <div className="label" style={{ marginBottom: 4 }}>In this cycle</div>
          <div className="cycle-detail-summary">
            <span><strong>{cycleTasks.length}</strong> work item{cycleTasks.length === 1 ? "" : "s"}</span>
            <span className="cycle-detail-dot" />
            <span><strong>{inProgress}</strong> open</span>
            <span className="cycle-detail-dot" />
            <span><strong>{completed}</strong> done</span>
          </div>
        </div>
        {canManage && (
          <div className="cycle-detail-actions">
            <button type="button" className="btn-ghost" onClick={() => setShowAdd((v) => !v)}>
              <FiPlus size={14} />
              {showAdd ? "Cancel" : "Add work items"}
            </button>
            <button type="button" className="btn-ghost cycle-delete-btn" onClick={() => setShowDelete((v) => !v)}>
              <FiTrash2 size={14} />
              {showDelete ? "Cancel" : "Delete cycle"}
            </button>
          </div>
        )}
      </div>

      {showAdd && canManage && (
        <CycleTaskPicker
          available={availableTasks}
          cycleTaskCount={cycleTasks.length}
          filter={filter}
          onFilter={setFilter}
          onCancel={() => setShowAdd(false)}
          onConfirm={addSelectedToCycle}
          busy={busy === "bulk-add"}
        />
      )}

      {showDelete && canManage && (
        <div className="cycle-delete-panel">
          <p className="sub" style={{ marginBottom: 10 }}>
            {cycleTasks.length === 0
              ? "This cycle has no work items. Deleting it is safe."
              : "Choose where the existing work items should go. Pick another cycle or leave them unassigned."}
          </p>
          <div className="field-row">
            <label className="field" style={{ margin: 0, flex: 1 }}>
              <span className="label">Move items to</span>
              <select className="select" value={deleteMoveTo} onChange={(e) => setDeleteMoveTo(e.target.value)}>
                <option value="">Unassigned (clear cycle)</option>
                {otherCycles.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
            <button type="button" className="btn cycle-delete-confirm" onClick={confirmDelete} disabled={busy === "delete"}>
              <FiTrash2 size={14} />
              {busy === "delete" ? "Deleting..." : "Delete cycle"}
            </button>
          </div>
        </div>
      )}

      <div className="cycle-task-list">
        {cycleTasks.length === 0 && (
          <div className="planning-empty">
            No work items in this cycle yet. Click <strong>Add work items</strong> to pull tasks in from this project.
          </div>
        )}
        {cycleTasks.map((task) => (
          <CycleTaskRow
            key={task.id}
            task={task}
            isDone={isDone(task)}
            onRemove={canManage ? () => removeFromCycle(task.id) : null}
            busy={busy === task.id}
            assigneeName={memberName(task.assignee_id)}
          />
        ))}
      </div>
    </article>
  );
}

function CycleTaskRow({
  task,
  isDone,
  onRemove,
  busy,
  assigneeName,
}: {
  task: BoardTask;
  isDone: boolean;
  onRemove: (() => void) | null;
  busy: boolean;
  assigneeName: string | null;
}) {
  const itemType = ITEM_TYPE_META[task.item_type] ?? ITEM_TYPE_META.task;
  const Icon = itemType.Icon;
  const displayKey = getTaskDisplayKey(task);
  return (
    <div className={`cycle-task-row${isDone ? " done" : ""}`}>
      <span className="cycle-task-prio" style={{ background: PRIORITY_COLOR[task.priority ?? ""] ?? "var(--text-faint)" }} aria-hidden />
      <span className="cycle-task-type" aria-hidden>{Icon ? <Icon size={13} /> : null}</span>
      <span className="cycle-task-title">{task.title}</span>
      <span className="cycle-task-meta">
        {assigneeName && (
          <span className="cycle-task-assignee">
            <span className="cycle-task-avatar" style={{ background: avatarBg(task.assignee_id ?? task.id) }}>
              {initials(assigneeName, null)}
            </span>
            {assigneeName}
          </span>
        )}
        {task.due_date && <span className="cycle-task-due">{task.due_date}</span>}
        <span className="cycle-task-key">{displayKey}</span>
      </span>
      {onRemove && (
        <button
          type="button"
          className="cycle-task-remove"
          onClick={onRemove}
          disabled={busy}
          aria-label="Remove from cycle"
          title="Remove from cycle"
        >
          <FiX size={14} />
        </button>
      )}
    </div>
  );
}

function CycleTaskPicker({
  available,
  cycleTaskCount,
  filter,
  onFilter,
  onCancel,
  onConfirm,
  busy,
}: {
  available: BoardTask[];
  cycleTaskCount: number;
  filter: string;
  onFilter: (v: string) => void;
  onCancel: () => void;
  onConfirm: (ids: string[]) => void;
  busy: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((current) => {
      if (current.size === available.length) return new Set();
      return new Set(available.map((t) => t.id));
    });
  }

  return (
    <div className="cycle-picker">
      <div className="cycle-picker-toolbar">
        <input
          className="input"
          placeholder="Filter by title, assignee, type…"
          value={filter}
          onChange={(e) => onFilter(e.target.value)}
        />
        <button type="button" className="btn-ghost" onClick={toggleAll}>
          {selected.size === available.length && available.length > 0 ? "Clear" : "Select all"}
        </button>
        <span className="cycle-picker-count">{selected.size} selected</span>
      </div>
      <div className="cycle-picker-list">
        {available.length === 0 ? (
          <div className="planning-empty">
            {cycleTaskCount === 0
              ? "No work items in this project yet. Create some, then come back to add them here."
              : "Every work item in this project is already in the cycle. Nice work."}
          </div>
        ) : (
          available.map((task) => {
            const checked = selected.has(task.id);
            return (
              <label key={task.id} className={`cycle-picker-row${checked ? " on" : ""}`}>
                <input type="checkbox" checked={checked} onChange={() => toggle(task.id)} />
                <span className="cycle-task-prio" style={{ background: PRIORITY_COLOR[task.priority ?? ""] ?? "var(--text-faint)" }} aria-hidden />
                <span className="cycle-task-title">{task.title}</span>
                <span className="cycle-task-meta">
                  {task.assignee_name && <span className="cycle-task-assignee">{task.assignee_name}</span>}
                  {task.due_date && <span className="cycle-task-due">{task.due_date}</span>}
                </span>
              </label>
            );
          })
        )}
      </div>
      <div className="cycle-picker-actions">
        <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>
        <button
          type="button"
          className="btn"
          disabled={selected.size === 0 || busy}
          onClick={() => onConfirm([...selected])}
        >
          <FiPlus size={14} />
          {busy ? "Adding..." : `Add ${selected.size || ""} to cycle`.trim()}
        </button>
      </div>
    </div>
  );
}
