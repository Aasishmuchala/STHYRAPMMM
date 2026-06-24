"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  createTaskStage,
  deleteTaskStage,
  requestTaskStageDeletionApproval,
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
const DELETE_APPROVAL_SESSION_KEY = "sthyra-task-stage-delete-approved";
const prioColor: Record<string, string> = { high: "var(--danger)", med: "var(--warning)", low: "var(--text-faint)" };
const DIV_SHORT: Record<string, string> = { studios: "Studios", digital: "Digital", construction: "Construction", living_twin: "Living Twin" };
const STAGE_COLORS = [
  { value: "var(--text-faint)", label: "Stone" },
  { value: "var(--accent)", label: "Accent" },
  { value: "var(--warning)", label: "Amber" },
  { value: "var(--positive)", label: "Green" },
  { value: "var(--danger)", label: "Rose" },
];
const VIEW_OPTIONS: { value: CanvasView; label: string }[] = [
  { value: "board", label: "Board" },
  { value: "constellations", label: "Constellations" },
  { value: "threads", label: "Threads" },
  { value: "cycles", label: "Cycles" },
];
const GROUP_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: "none", label: "None" },
  { value: "project", label: "Project" },
  { value: "division", label: "Division" },
];

type GroupBy = "none" | "project" | "division";
type CanvasView = "board" | "constellations" | "threads" | "cycles";
type DrawerState = { mode: "view"; task: BoardTask } | { mode: "create"; presetStatus: TaskStatus } | null;
type StageDraft = { label: string; color: string; is_done: boolean };
type DeleteStageState = {
  id: string;
  label: string;
  taskCount: number;
};

function defaultStageDrafts(stages: TaskStage[]) {
  return Object.fromEntries(
    stages.map((stage) => [stage.id, { label: stage.label, color: stage.color, is_done: stage.is_done }])
  ) as Record<string, StageDraft>;
}

function moveItem<T>(items: T[], from: number, to: number) {
  const next = items.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function projectQueryHref(searchParams: URLSearchParams, projectId: string) {
  const next = new URLSearchParams(searchParams.toString());
  next.set("project", projectId);
  return `/tasks?${next.toString()}`;
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
  activeProjectId,
}: {
  tasks: BoardTask[];
  stages: TaskStage[];
  divisions: DivisionOpt[];
  projects: ProjectOpt[];
  members: MemberOpt[];
  currentUserId: string;
  canManageWorkflow: boolean;
  initialDivision?: string;
  activeProjectId: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, start] = useTransition();
  const [divFilter, setDivFilter] = useState(initialDivision ?? "all");
  const [asgFilter, setAsgFilter] = useState("all");
  const [mineOnly, setMineOnly] = useState(false);
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  const [canvasView, setCanvasView] = useState<CanvasView>("board");
  const [boardTasks, setBoardTasks] = useState(tasks);
  const [stageList, setStageList] = useState(stages.length ? stages : DEFAULT_TASK_STAGES);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragSourceStatus, setDragSourceStatus] = useState<string | null>(null);
  const [draggingStageId, setDraggingStageId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<DrawerState>(null);
  const [workflowOpen, setWorkflowOpen] = useState(false);
  const [boardError, setBoardError] = useState<string | null>(null);
  const [stageDrafts, setStageDrafts] = useState<Record<string, StageDraft>>(defaultStageDrafts(stages.length ? stages : DEFAULT_TASK_STAGES));
  const [deleteDialog, setDeleteDialog] = useState<DeleteStageState | null>(null);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteMoveTo, setDeleteMoveTo] = useState("");
  const [deleteErr, setDeleteErr] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteApproved, setDeleteApproved] = useState(false);
  const [newStage, setNewStage] = useState({
    label: "",
    color: "var(--accent)",
    is_done: false,
    after_stage_id: "",
  });
  const justDraggedRef = useRef(false);
  const today = new Date();
  const activeProject = projects.find((project) => project.id === activeProjectId) ?? null;
  const isDraggingTask = draggingId !== null;
  const isDraggingStage = draggingStageId !== null;

  useEffect(() => {
    setBoardTasks(tasks);
  }, [tasks]);

  useEffect(() => {
    const nextStages = stages.length ? stages : DEFAULT_TASK_STAGES;
    setStageList(nextStages);
    setStageDrafts(defaultStageDrafts(nextStages));
    setNewStage((current) => ({
      ...current,
      after_stage_id: nextStages[nextStages.length - 1]?.id ?? "",
    }));
  }, [stages]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const approvedUser = window.sessionStorage.getItem(DELETE_APPROVAL_SESSION_KEY);
    setDeleteApproved(approvedUser === currentUserId);
  }, [currentUserId]);

  useEffect(() => {
    setWorkflowOpen(false);
  }, [activeProjectId]);

  const defaultCreateStage = stageList.find((stage) => !stage.is_done)?.id ?? stageList[0]?.id ?? "todo";
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

  function updateDraft(stageId: string, patch: Partial<StageDraft>) {
    setStageDrafts((current) => ({
      ...current,
      [stageId]: { ...current[stageId], ...patch },
    }));
  }

  function switchProject(projectId: string) {
    router.push(projectQueryHref(new URLSearchParams(searchParams.toString()), projectId));
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

  function handleStageReorder(draggedStageId: string, targetStageId: string) {
    if (!activeProjectId || !canManageWorkflow || draggedStageId === targetStageId) {
      setDraggingStageId(null);
      setDragOverCol(null);
      return;
    }

    const previousStages = stageList;
    const from = stageList.findIndex((stage) => stage.id === draggedStageId);
    const to = stageList.findIndex((stage) => stage.id === targetStageId);
    if (from < 0 || to < 0) return;

    const reordered = moveItem(stageList, from, to).map((stage, index) => ({ ...stage, position: index }));
    setBoardError(null);
    setDraggingStageId(null);
    setDragOverCol(null);
    setStageList(reordered);

    start(async () => {
      const res = await reorderTaskStages(activeProjectId, reordered.map((stage) => stage.id));
      if ("error" in res) {
        setBoardError(res.error);
        setStageList(previousStages);
        return;
      }
      router.refresh();
    });
  }

  function onDrop(targetStageId: string, e: React.DragEvent) {
    e.preventDefault();
    const stageId = e.dataTransfer.getData(STAGE_MIME) || draggingStageId;
    if (stageId) {
      handleStageReorder(stageId, targetStageId);
      return;
    }

    const taskId = e.dataTransfer.getData(CARD_MIME) || e.dataTransfer.getData("text/plain") || draggingId;
    if (!taskId) {
      setDragOverCol(null);
      return;
    }

    const task = boardTasks.find((item) => item.id === taskId);
    if (!task || task.status === targetStageId) {
      setDraggingId(null);
      setDragSourceStatus(null);
      setDragOverCol(null);
      return;
    }
    handleTaskDrop(targetStageId, taskId);
  }

  function saveStage(stageId: string) {
    if (!activeProjectId) return;
    const draft = stageDrafts[stageId];
    const previousStages = stageList;
    const updatedStages = stageList.map((stage) => (stage.id === stageId ? { ...stage, ...draft } : stage));
    setBoardError(null);
    setStageList(updatedStages);
    start(async () => {
      const res = await updateTaskStage(activeProjectId, stageId, draft);
      if ("error" in res) {
        setBoardError(res.error);
        setStageList(previousStages);
        return;
      }
      router.refresh();
    });
  }

  function openDeleteStage(stage: TaskStage) {
    const taskCount = boardTasks.filter((task) => task.status === stage.id).length;
    const fallbackMoveTo = stageList.find((item) => item.id !== stage.id)?.id ?? "";
    setDeleteDialog({ id: stage.id, label: stage.label, taskCount });
    setDeleteMoveTo(fallbackMoveTo);
    setDeletePassword("");
    setDeleteErr(null);
  }

  function closeDeleteStage() {
    if (deleteBusy) return;
    setDeleteDialog(null);
    setDeletePassword("");
    setDeleteErr(null);
  }

  async function removeStage() {
    if (!deleteDialog || !activeProjectId) return;
    const previousStages = stageList;
    const previousTasks = boardTasks;
    const targetStageId = deleteDialog.taskCount > 0 ? deleteMoveTo : null;
    if (deleteDialog.taskCount > 0 && !targetStageId) {
      setDeleteErr("Choose where the remaining tasks should move first.");
      return;
    }

    setDeleteBusy(true);
    setDeleteErr(null);

    if (!deleteApproved) {
      const approval = await requestTaskStageDeletionApproval(deletePassword);
      if ("error" in approval) {
        setDeleteBusy(false);
        setDeleteErr(approval.error);
        return;
      }
      setDeleteApproved(true);
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(DELETE_APPROVAL_SESSION_KEY, currentUserId);
      }
    }

    const replacement = stageList.find((stage) => stage.id === targetStageId) ?? null;
    const remainingStages = stageList.filter((stage) => stage.id !== deleteDialog.id).map((stage, index) => ({ ...stage, position: index }));
    const remappedTasks = boardTasks.map((task) => {
      if (task.status !== deleteDialog.id || !replacement) return task;
      return { ...task, status: replacement.id };
    });

    setBoardError(null);
    setStageList(remainingStages);
    setBoardTasks(remappedTasks);

    const res = await deleteTaskStage({
      project_id: activeProjectId,
      stage_id: deleteDialog.id,
      move_tasks_to: targetStageId,
    });

    if ("error" in res) {
      setBoardError(res.error);
      setStageList(previousStages);
      setBoardTasks(previousTasks);
      setDeleteBusy(false);
      setDeleteErr(res.error);
      return;
    }

    setDeleteBusy(false);
    setDeleteDialog(null);
    setDeletePassword("");
    setDeleteErr(null);
    router.refresh();
  }

  function addStage(e: React.FormEvent) {
    e.preventDefault();
    if (!activeProjectId) return;
    setBoardError(null);
    start(async () => {
      const res = await createTaskStage({
        project_id: activeProjectId,
        label: newStage.label,
        color: newStage.color,
        is_done: newStage.is_done,
        after_stage_id: newStage.after_stage_id || null,
      });
      if ("error" in res) {
        setBoardError(res.error);
        return;
      }

      const insertAfter = newStage.after_stage_id ? stageList.findIndex((stage) => stage.id === newStage.after_stage_id) : stageList.length - 1;
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
        after_stage_id: res.data.id,
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
          setDraggingStageId(null);
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

  function renderPlanningView() {
    const cards = [
      {
        title: "Constellations",
        copy: "Big arcs for this project. Use them to anchor large outcomes across teams before the detailed task flow starts.",
        count: new Set(filtered.map((task) => task.division_id)).size,
        meta: "High-level arcs",
      },
      {
        title: "Threads",
        copy: "Focused workstreams that sit underneath each constellation. This is the layer where teams shape the story before cards get split into task work.",
        count: filtered.length,
        meta: "Work threads",
      },
      {
        title: "Cycles",
        copy: "Time-boxed bursts for the active project. Keep the board execution-focused while cycles frame what the team is aiming to finish next.",
        count: stageList.filter((stage) => !stage.is_done).length,
        meta: "Active cycles",
      },
    ];

    return (
      <section className="workflow-panel glass" aria-label="Project planning layers">
        <div className="workflow-panel-head">
          <div>
            <div className="label" style={{ marginBottom: 6 }}>Project flow</div>
            <div className="workflow-panel-copy">The board is live now. These planning layers are the next level above the board so each project can stay structured without dumping everything into one place.</div>
          </div>
        </div>
        <div className="workflow-grid">
          {cards.map((card) => (
            <div key={card.title} className="workflow-card">
              <div className="workflow-card-head">
                <span className="statuspill">{card.title}</span>
                <span className="workflow-hint">{card.meta}</span>
              </div>
              <div className="tcard-title" style={{ marginBottom: 10 }}>{card.count}</div>
              <div className="workflow-panel-copy" style={{ fontSize: 13 }}>{card.copy}</div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (!activeProjectId || !activeProject) {
    return (
      <section className="project-hero glass" aria-label="Projects required">
        <div className="project-hero-copy">
          <div>
            <div className="label" style={{ marginBottom: 8 }}>Projects</div>
            <h2 className="project-hero-title">Create your first project</h2>
            <div className="workflow-panel-copy">Projects are now the top layer of Tasks. Create one here, then each project gets its own workflow, board, and planning flow automatically.</div>
          </div>
          <div className="project-hero-actions">
            <a href="/projects" className="btn project-cta">
              <IconPlus size={14} />Create project
            </a>
          </div>
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="project-hero glass" aria-label="Project workspace">
        <div className="project-hero-copy">
          <div>
            <div className="label" style={{ marginBottom: 8 }}>Project workspace</div>
            <h2 className="project-hero-title">{activeProject.name}</h2>
            <div className="workflow-panel-copy">Switch the project from the dropdown below. The workflow, board, and planning layers will follow that project automatically.</div>
          </div>
          <div className="project-hero-actions">
            <label className="field project-select-wrap">
              <span className="label">Current project</span>
              <select className="select project-select" value={activeProjectId} onChange={(e) => switchProject(e.target.value)}>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>{project.name}</option>
                ))}
              </select>
            </label>
            <a href="/projects" className="btn project-cta">
              <IconPlus size={14} />Create project
            </a>
            <a href="/projects" className="btn-ghost project-manage-link">
              Manage projects
            </a>
          </div>
        </div>
      </section>

      <div className="toolbar task-control-grid">
        <label className="field task-control">
          <span className="label">Workspace view</span>
          <select className="select" value={canvasView} onChange={(e) => setCanvasView(e.target.value as CanvasView)}>
            {VIEW_OPTIONS.map((view) => <option key={view.value} value={view.value}>{view.label}</option>)}
          </select>
        </label>
        <label className="field task-control">
          <span className="label">Division scope</span>
          <select className="select" value={divFilter} onChange={(e) => setDivFilter(e.target.value)}>
            <option value="all">All divisions</option>
            {divisions.map((division) => <option key={division.slug} value={division.slug}>{division.name.replace(/^Sthyra\s+/, "")}</option>)}
          </select>
        </label>
        <label className="field task-control">
          <span className="label">Group by</span>
          <select className="select" value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)}>
            {GROUP_OPTIONS.map((group) => <option key={group.value} value={group.value}>{group.label}</option>)}
          </select>
        </label>
        <label className="field task-control">
          <span className="label">Assignee</span>
          <select className="select" aria-label="Filter by assignee" value={asgFilter} onChange={(e) => setAsgFilter(e.target.value)}>
            <option value="all">All assignees</option>
            <option value="unassigned">Unassigned</option>
            {members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
          </select>
        </label>
      </div>

      {canvasView !== "board" ? renderPlanningView() : (
        <>
          <div className="toolbar">
            <button className={`fpill ${mineOnly ? "on" : ""}`} onClick={() => setMineOnly((value) => !value)}>My tasks</button>
            {canManageWorkflow && (
              <button className={`fpill ${workflowOpen ? "on" : ""}`} onClick={() => setWorkflowOpen((value) => !value)}>
                {workflowOpen ? "Hide workflow" : "Edit workflow"}
              </button>
            )}
            <button className="btn" onClick={() => setDrawer({ mode: "create", presetStatus: defaultCreateStage })}>
              <IconPlus size={15} />New task
            </button>
          </div>

          {canManageWorkflow && workflowOpen && (
            <section className="workflow-panel glass" aria-label="Workflow editor">
              <div className="workflow-panel-head">
                <div>
                  <div className="label" style={{ marginBottom: 6 }}>Workflow</div>
                  <div className="workflow-panel-copy">You are editing {activeProject.name}&rsquo;s workflow. Drag stages to reorder them. Deleting a stage asks for your password once per session and can move leftover tasks safely.</div>
                </div>
              </div>
              <div className="workflow-grid">
                {stageList.map((stage) => {
                  const draft = stageDrafts[stage.id] ?? { label: stage.label, color: stage.color, is_done: stage.is_done };
                  return (
                    <div key={stage.id} className="workflow-card">
                      <div className="workflow-card-head">
                        <span className="statuspill">
                          <span className="cdot" style={{ width: 7, height: 7, borderRadius: "50%", background: draft.color }} />
                          {stage.key}
                        </span>
                        <span className="workflow-hint">Project-only stage</span>
                      </div>
                      <label className="field">
                        <span className="label">Stage name</span>
                        <input className="input" value={draft.label} onChange={(e) => updateDraft(stage.id, { label: e.target.value })} />
                      </label>
                      <div className="field-row">
                        <label className="field">
                          <span className="label">Color</span>
                          <select className="select" value={draft.color} onChange={(e) => updateDraft(stage.id, { color: e.target.value })}>
                            {STAGE_COLORS.map((color) => <option key={color.value} value={color.value}>{color.label}</option>)}
                          </select>
                        </label>
                        <label className="field workflow-check">
                          <span className="label">Done column</span>
                          <input type="checkbox" checked={draft.is_done} onChange={(e) => updateDraft(stage.id, { is_done: e.target.checked })} />
                        </label>
                      </div>
                      <div className="workflow-actions">
                        <button className="btn-ghost" onClick={() => saveStage(stage.id)}>Save stage</button>
                        <button className="btn-danger" onClick={() => openDeleteStage(stage)}>Delete</button>
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
                      <select className="select" value={newStage.after_stage_id} onChange={(e) => setNewStage((current) => ({ ...current, after_stage_id: e.target.value }))}>
                        {stageList.map((stage) => <option key={stage.id} value={stage.id}>{stage.label}</option>)}
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
                const items = filtered.filter((task) => task.status === stage.id);
                const groups = groupItems(items);
                return (
                  <section
                    className={`col ${dragOverCol === stage.id ? "dragover" : ""} ${draggingStageId === stage.id ? "dragging-stage" : ""} ${isDraggingTask ? "drag-card-active" : ""}`}
                    key={stage.id}
                    aria-label={stage.label}
                    onDragOver={(e) => {
                      if (isDraggingTask && dragSourceStatus === stage.id) return;
                      if (isDraggingStage && draggingStageId === stage.id) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      setDragOverCol(stage.id);
                    }}
                    onDragLeave={(e) => {
                      if (e.currentTarget === e.target) setDragOverCol(null);
                    }}
                    onDrop={(e) => onDrop(stage.id, e)}
                  >
                    <div
                      className={`col-head ${canManageWorkflow ? "col-head-draggable" : ""}`}
                      draggable={canManageWorkflow}
                      onDragStart={(e) => {
                        if (!canManageWorkflow) return;
                        setDraggingStageId(stage.id);
                        setDraggingId(null);
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData(STAGE_MIME, stage.id);
                      }}
                      onDragEnd={() => {
                        setDraggingStageId(null);
                        setDragOverCol(null);
                      }}
                    >
                      <span className="ct"><span className="cdot" style={{ background: stage.color }} />{stage.label}</span>
                      <span className="col-head-right">
                        {canManageWorkflow && <span className="col-grab">Stages</span>}
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
                      {isDraggingTask && dragSourceStatus !== stage.id && (
                        <div className={`drop-placeholder ${dragOverCol === stage.id ? "on" : ""}`}>
                          <span>{dragOverCol === stage.id ? "Drop task here" : "Drag task here"}</span>
                        </div>
                      )}
                      {isDraggingStage && !isDraggingTask && draggingStageId !== stage.id && (
                        <div className={`drop-placeholder stage ${dragOverCol === stage.id ? "on" : ""}`}>
                          <span>{dragOverCol === stage.id ? "Drop stage here" : "Move stage here"}</span>
                        </div>
                      )}
                    </div>
                    <button className="addbtn" onClick={() => setDrawer({ mode: "create", presetStatus: stage.id })}>
                      <IconPlus size={13} />Add
                    </button>
                  </section>
                );
              })}
            </div>
          </div>
        </>
      )}

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
          lockedProjectId={activeProjectId}
        />
      )}

      {deleteDialog && (
        <div className="modal-overlay" onClick={closeDeleteStage} role="alertdialog" aria-modal="true" aria-label="Delete workflow stage" style={{ zIndex: 85 }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Delete &quot;{deleteDialog.label}&quot;</h3>
            <p style={{ color: "var(--text-dim)", fontSize: 13, lineHeight: 1.7, marginBottom: 18 }}>
              {deleteDialog.taskCount > 0
                ? `There ${deleteDialog.taskCount === 1 ? "is" : "are"} ${deleteDialog.taskCount} task${deleteDialog.taskCount === 1 ? "" : "s"} still in this stage. Choose where they should move before this stage is deleted.`
                : "This stage is empty. Once deleted, it will be removed from this project's workflow immediately."}
            </p>

            {deleteDialog.taskCount > 0 && (
              <label className="field">
                <span className="label">Move remaining tasks to</span>
                <select className="select" value={deleteMoveTo} onChange={(e) => setDeleteMoveTo(e.target.value)}>
                  {stageList.filter((stage) => stage.id !== deleteDialog.id).map((stage) => (
                    <option key={stage.id} value={stage.id}>{stage.label}</option>
                  ))}
                </select>
              </label>
            )}

            {!deleteApproved && (
              <label className="field">
                <span className="label">Confirm with your account password</span>
                <input
                  className="input"
                  type="password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  placeholder="Enter your password"
                  autoFocus
                />
              </label>
            )}

            {deleteApproved && (
              <div role="status" style={{ fontSize: 12.5, color: "var(--positive)", background: "color-mix(in srgb, var(--positive) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--positive) 26%, transparent)", borderRadius: 8, padding: "9px 11px", marginBottom: 14 }}>
                Password already confirmed for this browser session. You can delete more stages without re-entering it.
              </div>
            )}

            {deleteErr && <div className="form-err" role="alert">{deleteErr}</div>}

            <div className="modal-actions">
              <button className="btn-ghost" onClick={closeDeleteStage} disabled={deleteBusy}>Cancel</button>
              <button className="btn" onClick={removeStage} disabled={deleteBusy} style={{ background: "var(--danger)", color: "#fff" }}>
                {deleteBusy ? "Deleting..." : "Delete stage"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
