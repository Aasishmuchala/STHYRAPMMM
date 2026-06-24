"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createTaskStage,
  deleteTaskStage,
  reorderTaskStages,
  setTaskStatus,
  updateTaskStage,
} from "@/app/tasks/actions";
import { DEFAULT_TASK_STAGES } from "@/lib/tasks-types";
import type {
  BoardTask,
  DivisionOpt,
  MemberOpt,
  ProjectOpt,
  TaskStage,
  TaskStatus,
} from "@/lib/tasks-types";
import { dueLabel, initials } from "@/lib/format";
import { avatarBg } from "@/lib/avatar";
import { IconPlus } from "@/components/icons";
import { TaskDrawer } from "./TaskDrawer";

const CARD_MIME = "application/x-sthyra-task-card";
const STAGE_MIME = "application/x-sthyra-task-stage";
const prioColor: Record<string, string> = { high: "var(--danger)", med: "var(--warning)", low: "var(--text-faint)" };
const DIV_SHORT: Record<string, string> = { studios: "Studios", digital: "Digital", construction: "Construction", living_twin: "Living Twin" };
const STAGE_COLORS = [
  { value: "var(--text-faint)", label: "Stone" },
  { value: "var(--accent)", label: "Accent" },
  { value: "var(--warning)", label: "Amber" },
  { value: "var(--positive)", label: "Green" },
  { value: "var(--danger)", label: "Rose" },
];

type GroupBy = "none" | "project" | "division";
type DrawerState = { mode: "view"; task: BoardTask } | { mode: "create"; presetStatus: TaskStatus } | null;
type StageDraft = { label: string; color: string; is_done: boolean };

function defaultStageDrafts(stages: TaskStage[]) {
  return Object.fromEntries(
    stages.map((stage) => [stage.key, { label: stage.label, color: stage.color, is_done: stage.is_done }])
  ) as Record<string, StageDraft>;
}

function moveItem<T>(items: T[], from: number, to: number) {
  const next = items.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function TaskBoard({
  tasks,
  stages,
  divisions,
  projects,
  members,
  currentUserId,
  canManageWorkflow,
  initialDivision,
}: {
  tasks: BoardTask[];
  stages: TaskStage[];
  divisions: DivisionOpt[];
  projects: ProjectOpt[];
  members: MemberOpt[];
  currentUserId: string;
  canManageWorkflow: boolean;
  initialDivision?: string;
}) {
  const router = useRouter();
  const [, start] = useTransition();
  const [divFilter, setDivFilter] = useState(initialDivision ?? "all");
  const [asgFilter, setAsgFilter] = useState("all");
  const [mineOnly, setMineOnly] = useState(false);
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  const [boardTasks, setBoardTasks] = useState(tasks);
  const [stageList, setStageList] = useState(stages.length ? stages : DEFAULT_TASK_STAGES);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragSourceStatus, setDragSourceStatus] = useState<string | null>(null);
  const [draggingStageKey, setDraggingStageKey] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<DrawerState>(null);
  const [workflowOpen, setWorkflowOpen] = useState(false);
  const [boardError, setBoardError] = useState<string | null>(null);
  const [stageDrafts, setStageDrafts] = useState<Record<string, StageDraft>>(defaultStageDrafts(stages.length ? stages : DEFAULT_TASK_STAGES));
  const [newStage, setNewStage] = useState({
    label: "",
    color: "var(--accent)",
    is_done: false,
    after_key: "",
  });
  const today = new Date();
  const isDraggingTask = draggingId !== null;
  const isDraggingStage = draggingStageKey !== null;
  const justDraggedRef = useRef(false);

  useEffect(() => {
    setBoardTasks(tasks);
  }, [tasks]);

  useEffect(() => {
    const nextStages = stages.length ? stages : DEFAULT_TASK_STAGES;
    setStageList(nextStages);
    setStageDrafts(defaultStageDrafts(nextStages));
    setNewStage((current) => ({
      ...current,
      after_key: nextStages[nextStages.length - 1]?.key ?? "",
    }));
  }, [stages]);

  const defaultCreateStage = stageList.find((stage) => !stage.is_done)?.key ?? stageList[0]?.key ?? "todo";
  const filtered = boardTasks.filter(
    (task) =>
      (divFilter === "all" || task.division_slug === divFilter) &&
      (asgFilter === "all" || (asgFilter === "unassigned" ? !task.assignee_id : task.assignee_id === asgFilter)) &&
      (!mineOnly || task.assignee_id === currentUserId)
  );

  function groupItems(items: BoardTask[]) {
    if (groupBy === "none") return [{ name: "", items }];
    const map = new Map<string, BoardTask[]>();
    for (const task of items) {
      const name = groupBy === "project" ? (task.project_name ?? "No project") : task.division_name.replace(/^Sthyra\s+/, "");
      if (!map.has(name)) map.set(name, []);
      map.get(name)!.push(task);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([name, groupedItems]) => ({ name, items: groupedItems }));
  }

  function updateDraft(key: string, patch: Partial<StageDraft>) {
    setStageDrafts((current) => ({
      ...current,
      [key]: { ...current[key], ...patch },
    }));
  }

  function handleTaskDrop(status: TaskStatus, taskId: string) {
    const previousTasks = boardTasks;
    setBoardError(null);
    setDraggingId(null);
    setDragSourceStatus(null);
    setDragOverCol(null);
    setBoardTasks((current) => current.map((task) => (task.id === taskId ? { ...task, status } : task)));
    start(async () => {
      const res = await setTaskStatus(taskId, status);
      if ("error" in res) {
        setBoardError(res.error);
        setBoardTasks(previousTasks);
        return;
      }
      router.refresh();
    });
  }

  function handleStageReorder(draggedKey: string, targetKey: string) {
    if (!canManageWorkflow || draggedKey === targetKey) {
      setDraggingStageKey(null);
      setDragOverCol(null);
      return;
    }

    const previousStages = stageList;
    const from = stageList.findIndex((stage) => stage.key === draggedKey);
    const to = stageList.findIndex((stage) => stage.key === targetKey);
    if (from < 0 || to < 0) return;

    const reordered = moveItem(stageList, from, to).map((stage, index) => ({ ...stage, position: index }));
    setBoardError(null);
    setDraggingStageKey(null);
    setDragOverCol(null);
    setStageList(reordered);

    start(async () => {
      const res = await reorderTaskStages(reordered.map((stage) => stage.key));
      if ("error" in res) {
        setBoardError(res.error);
        setStageList(previousStages);
        return;
      }
      router.refresh();
    });
  }

  function onDrop(targetKey: string, e: React.DragEvent) {
    e.preventDefault();
    const stageKey = e.dataTransfer.getData(STAGE_MIME) || draggingStageKey;
    if (stageKey) {
      handleStageReorder(stageKey, targetKey);
      return;
    }

    const taskId = e.dataTransfer.getData(CARD_MIME) || e.dataTransfer.getData("text/plain") || draggingId;
    if (!taskId) {
      setDragOverCol(null);
      return;
    }

    const task = boardTasks.find((item) => item.id === taskId);
    if (!task || task.status === targetKey) {
      setDraggingId(null);
      setDragSourceStatus(null);
      setDragOverCol(null);
      return;
    }
    handleTaskDrop(targetKey, taskId);
  }

  function saveStage(key: string) {
    const draft = stageDrafts[key];
    const previousStages = stageList;
    const updatedStages = stageList.map((stage) => (stage.key === key ? { ...stage, ...draft } : stage));
    setBoardError(null);
    setStageList(updatedStages);
    start(async () => {
      const res = await updateTaskStage(key, draft);
      if ("error" in res) {
        setBoardError(res.error);
        setStageList(previousStages);
        return;
      }
      router.refresh();
    });
  }

  function removeStage(key: string) {
    const previousStages = stageList;
    const remainingStages = stageList
      .filter((stage) => stage.key !== key)
      .map((stage, index) => ({ ...stage, position: index }));
    setBoardError(null);
    setStageList(remainingStages);
    start(async () => {
      const res = await deleteTaskStage(key);
      if ("error" in res) {
        setBoardError(res.error);
        setStageList(previousStages);
        return;
      }
      router.refresh();
    });
  }

  function addStage(e: React.FormEvent) {
    e.preventDefault();
    setBoardError(null);
    start(async () => {
      const res = await createTaskStage({
        label: newStage.label,
        color: newStage.color,
        is_done: newStage.is_done,
        after_key: newStage.after_key || null,
      });
      if ("error" in res) {
        setBoardError(res.error);
        return;
      }

      const insertAfter = newStage.after_key ? stageList.findIndex((stage) => stage.key === newStage.after_key) : stageList.length - 1;
      const insertAt = insertAfter >= 0 ? insertAfter + 1 : stageList.length;
      const nextStages = stageList.slice();
      nextStages.splice(insertAt, 0, res.data);
      const normalized = nextStages.map((stage, index) => ({ ...stage, position: index }));
      setStageList(normalized);
      setStageDrafts(defaultStageDrafts(normalized));
      setNewStage({
        label: "",
        color: "var(--accent)",
        is_done: false,
        after_key: res.data.key,
      });
      router.refresh();
    });
  }

  function Card({ task }: { task: BoardTask }) {
    return (
      <article
        className={`tcard ${draggingId === task.id ? "dragging" : ""}`}
        draggable
        onDragStart={(e) => {
          justDraggedRef.current = true;
          setDraggingId(task.id);
          setDragSourceStatus(task.status);
          setDraggingStageKey(null);
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData(CARD_MIME, task.id);
          e.dataTransfer.setData("text/plain", task.id);
        }}
        onDragEnd={() => {
          setDraggingId(null);
          setDragSourceStatus(null);
          setDragOverCol(null);
          window.setTimeout(() => {
            justDraggedRef.current = false;
          }, 140);
        }}
        onClick={(e) => {
          if (justDraggedRef.current) {
            e.preventDefault();
            e.stopPropagation();
            justDraggedRef.current = false;
            return;
          }
          setDrawer({ mode: "view", task });
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") setDrawer({ mode: "view", task });
        }}
        role="button"
        tabIndex={0}
        aria-label={`Open ${task.title}`}
      >
        <div className="tcard-top">
          <span className="tprio" style={{ background: prioColor[task.priority] }} title={task.priority} />
          {task.project_name && groupBy !== "project" && <span className="chip">{task.project_name}</span>}
          {task.assignee_name && (
            <span className="tasg" style={{ background: avatarBg(task.assignee_name), marginLeft: "auto" }} title={task.assignee_name}>
              {initials(task.assignee_name, null)}
            </span>
          )}
        </div>
        <div className="tcard-title">{task.title}</div>
        {task.description && <div className="tcard-desc">{task.description}</div>}
        <div className="tmeta">
          {groupBy !== "division" ? <span className="chip">{DIV_SHORT[task.division_slug] ?? task.division_name}</span> : <span />}
          {task.due_date && <span className="tdue">{dueLabel(task.due_date, today)}</span>}
        </div>
      </article>
    );
  }

  return (
    <>
      <div className="toolbar">
        <div className="board-tabs">
          <button className={`fpill ${divFilter === "all" ? "on" : ""}`} onClick={() => setDivFilter("all")}>All divisions</button>
          {divisions.map((division) => (
            <button key={division.slug} className={`fpill ${divFilter === division.slug ? "on" : ""}`} onClick={() => setDivFilter(division.slug)}>
              {division.name.replace(/^Sthyra\s+/, "")}
            </button>
          ))}
        </div>
        <div className="spacer" />
        <span className="tool-label">Group</span>
        <div className="segctl" role="group" aria-label="Group by">
          <button className={groupBy === "none" ? "on" : ""} onClick={() => setGroupBy("none")}>None</button>
          <button className={groupBy === "project" ? "on" : ""} onClick={() => setGroupBy("project")}>Project</button>
          <button className={groupBy === "division" ? "on" : ""} onClick={() => setGroupBy("division")}>Division</button>
        </div>
        <select className="select tool-select" aria-label="Filter by assignee" value={asgFilter} onChange={(e) => setAsgFilter(e.target.value)}>
          <option value="all">All assignees</option>
          <option value="unassigned">Unassigned</option>
          {members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
        </select>
        <button className={`fpill ${mineOnly ? "on" : ""}`} onClick={() => setMineOnly((value) => !value)}>My tasks</button>
        {canManageWorkflow && (
          <button className={`fpill ${workflowOpen ? "on" : ""}`} onClick={() => setWorkflowOpen((value) => !value)}>
            {workflowOpen ? "Hide workflow" : "Edit workflow"}
          </button>
        )}
        <button className="btn" onClick={() => setDrawer({ mode: "create", presetStatus: defaultCreateStage })}><IconPlus size={15} />New task</button>
      </div>

      {canManageWorkflow && workflowOpen && (
        <section className="workflow-panel glass" aria-label="Workflow editor">
          <div className="workflow-panel-head">
            <div>
              <div className="label" style={{ marginBottom: 6 }}>Workflow</div>
              <div className="workflow-panel-copy">Drag column headers to reorder them. Add a new stage anywhere and the board order will be saved to Supabase.</div>
            </div>
          </div>
          <div className="workflow-grid">
            {stageList.map((stage) => {
              const draft = stageDrafts[stage.key] ?? { label: stage.label, color: stage.color, is_done: stage.is_done };
              const isDefault = DEFAULT_TASK_STAGES.some((item) => item.key === stage.key);
              return (
                <div key={stage.key} className="workflow-card">
                  <div className="workflow-card-head">
                    <span className="statuspill">
                      <span className="cdot" style={{ width: 7, height: 7, borderRadius: "50%", background: draft.color }} />
                      {stage.key}
                    </span>
                    <span className="workflow-hint">Drag this column on the board</span>
                  </div>
                  <label className="field">
                    <span className="label">Stage name</span>
                    <input className="input" value={draft.label} onChange={(e) => updateDraft(stage.key, { label: e.target.value })} />
                  </label>
                  <div className="field-row">
                    <label className="field">
                      <span className="label">Color</span>
                      <select className="select" value={draft.color} onChange={(e) => updateDraft(stage.key, { color: e.target.value })}>
                        {STAGE_COLORS.map((color) => <option key={color.value} value={color.value}>{color.label}</option>)}
                      </select>
                    </label>
                    <label className="field workflow-check">
                      <span className="label">Done column</span>
                      <input type="checkbox" checked={draft.is_done} onChange={(e) => updateDraft(stage.key, { is_done: e.target.checked })} />
                    </label>
                  </div>
                  <div className="workflow-actions">
                    <button className="btn-ghost" onClick={() => saveStage(stage.key)}>Save stage</button>
                    {!isDefault && <button className="btn-danger" onClick={() => removeStage(stage.key)}>Delete</button>}
                  </div>
                </div>
              );
            })}
            <form className="workflow-card workflow-add-card" onSubmit={addStage}>
              <div className="workflow-card-head">
                <span className="statuspill"><IconPlus size={12} />New stage</span>
              </div>
              <label className="field">
                <span className="label">Stage name</span>
                <input className="input" value={newStage.label} onChange={(e) => setNewStage((current) => ({ ...current, label: e.target.value }))} placeholder="Blocked, QA, Ready for client..." />
              </label>
              <div className="field-row">
                <label className="field">
                  <span className="label">Insert after</span>
                  <select className="select" value={newStage.after_key} onChange={(e) => setNewStage((current) => ({ ...current, after_key: e.target.value }))}>
                    {stageList.map((stage) => <option key={stage.key} value={stage.key}>{stage.label}</option>)}
                  </select>
                </label>
                <label className="field">
                  <span className="label">Color</span>
                  <select className="select" value={newStage.color} onChange={(e) => setNewStage((current) => ({ ...current, color: e.target.value }))}>
                    {STAGE_COLORS.map((color) => <option key={color.value} value={color.value}>{color.label}</option>)}
                  </select>
                </label>
              </div>
              <label className="field workflow-check">
                <span className="label">Treat as done</span>
                <input type="checkbox" checked={newStage.is_done} onChange={(e) => setNewStage((current) => ({ ...current, is_done: e.target.checked }))} />
              </label>
              <div className="workflow-actions">
                <button type="submit" className="btn">Add stage</button>
              </div>
            </form>
          </div>
        </section>
      )}

      {boardError && <div className="form-err" role="alert" style={{ marginBottom: 16 }}>{boardError}</div>}

      <div className="board-scroll">
        <div className="board board-dynamic">
          {stageList.map((stage) => {
            const items = filtered.filter((task) => task.status === stage.key);
            const groups = groupItems(items);
            return (
              <section
                className={`col ${dragOverCol === stage.key ? "dragover" : ""} ${draggingStageKey === stage.key ? "dragging-stage" : ""} ${isDraggingTask ? "drag-card-active" : ""}`}
                key={stage.key}
                aria-label={stage.label}
                onDragOver={(e) => {
                  if (isDraggingTask && dragSourceStatus === stage.key) return;
                  if (isDraggingStage && draggingStageKey === stage.key) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  setDragOverCol(stage.key);
                }}
                onDragLeave={(e) => {
                  if (e.currentTarget === e.target) setDragOverCol(null);
                }}
                onDrop={(e) => onDrop(stage.key, e)}
              >
                <div
                  className={`col-head ${canManageWorkflow ? "col-head-draggable" : ""}`}
                  draggable={canManageWorkflow}
                  onDragStart={(e) => {
                    if (!canManageWorkflow) return;
                    setDraggingStageKey(stage.key);
                    setDraggingId(null);
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData(STAGE_MIME, stage.key);
                  }}
                  onDragEnd={() => {
                    setDraggingStageKey(null);
                    setDragOverCol(null);
                  }}
                >
                  <span className="ct"><span className="cdot" style={{ background: stage.color }} />{stage.label}</span>
                  <span className="col-head-right">
                    {canManageWorkflow && <span className="col-grab">Tasks</span>}
                    <span className="cnt">{items.length}</span>
                  </span>
                </div>
                <div className="col-body">
                  {items.length === 0 ? (
                    <div className="col-empty">Nothing here</div>
                  ) : (
                    groups.map((group) => (
                      <div key={group.name || "all"} className="task-stack">
                        {groupBy !== "none" && (
                          <div className="tgroup-head">
                            <span className="tgroup-name">{group.name}</span>
                            <span className="tgroup-line" />
                            <span className="tgroup-cnt">{group.items.length}</span>
                          </div>
                        )}
                        {group.items.map((task) => <Card key={task.id} task={task} />)}
                      </div>
                    ))
                  )}
                  {isDraggingTask && dragSourceStatus !== stage.key && (
                    <div className={`drop-placeholder ${dragOverCol === stage.key ? "on" : ""}`}>
                      <span>{dragOverCol === stage.key ? "Drop task here" : "Drag task here"}</span>
                    </div>
                  )}
                  {isDraggingStage && !isDraggingTask && draggingStageKey !== stage.key && (
                    <div className={`drop-placeholder stage ${dragOverCol === stage.key ? "on" : ""}`}>
                      <span>{dragOverCol === stage.key ? "Drop stage here" : "Move stage here"}</span>
                    </div>
                  )}
                </div>
                <button className="addbtn" onClick={() => setDrawer({ mode: "create", presetStatus: stage.key })}>
                  <IconPlus size={13} />Add
                </button>
              </section>
            );
          })}
        </div>
      </div>

      {drawer && (
        <TaskDrawer
          initialMode={drawer.mode}
          task={drawer.mode === "view" ? drawer.task : undefined}
          presetStatus={drawer.mode === "create" ? drawer.presetStatus : undefined}
          divisions={divisions}
          projects={projects}
          members={members}
          stages={stageList}
          onClose={() => setDrawer(null)}
        />
      )}
    </>
  );
}
