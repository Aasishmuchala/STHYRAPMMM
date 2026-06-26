"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { IconType } from "react-icons";
import { useDismiss } from "@/lib/useDismiss";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { createTask, deleteTask, setTaskStatus, updateTask } from "@/app/tasks/actions";
import type {
  BoardTask,
  CycleOpt,
  DivisionOpt,
  MemberOpt,
  ModuleOpt,
  ProjectOpt,
  TaskInput,
  TaskStage,
  TaskStatus,
  WorkItemType,
} from "@/lib/tasks-types";

import { TASK_PRIORITY_ORDER } from "@/lib/tasks-types";
import { dueLabel, initials } from "@/lib/format";
import { avatarBg } from "@/lib/avatar";
import { FiCalendar, FiFlag, FiFolder, FiLayers, FiTarget, FiX } from "react-icons/fi";
import { HiOutlineBugAnt } from "react-icons/hi2";
import { LuCircleDotDashed } from "react-icons/lu";
import { PiDiamondsFourDuotone, PiSparkleFill } from "react-icons/pi";
import { TbSubtask } from "react-icons/tb";
import { PRIORITY_ICON_META } from "./taskMeta";

type Mode = "view" | "edit" | "create";

const typeMeta: Record<
  WorkItemType,
  { label: string; color: string; Icon: IconType }
> = {
  epic: { label: "Epic", color: "#f97316", Icon: PiDiamondsFourDuotone },
  story: { label: "Story", color: "#2563eb", Icon: FiFlag },
  task: { label: "Task", color: "#0f172a", Icon: LuCircleDotDashed },
  bug: { label: "Bug", color: "#ef4444", Icon: HiOutlineBugAnt },
  improvement: { label: "Improvement", color: "#10b981", Icon: PiSparkleFill },
  subtask: { label: "Sub-task", color: "#8b5cf6", Icon: TbSubtask },
};
const typeOptions = Object.entries(typeMeta) as [WorkItemType, (typeof typeMeta)[WorkItemType]][];
const priorityOptions = TASK_PRIORITY_ORDER.map((value) => [value, PRIORITY_ICON_META[value]] as const);

export function TaskDrawer({
  initialMode,
  task,
  presetStatus,
  divisions,
  projects,
  members,
  cycles,
  modules,
  epics,
  stages,
  onClose,
  lockedProjectId,
}: {
  initialMode: Mode;
  task?: BoardTask;
  presetStatus?: TaskStatus;
  divisions: DivisionOpt[];
  projects: ProjectOpt[];
  members: MemberOpt[];
  cycles: CycleOpt[];
  modules: ModuleOpt[];
  epics: BoardTask[];
  stages: TaskStage[];
  onClose: () => void;
  lockedProjectId?: string | null;
}) {
  const router = useRouter();
  const lockedProject = lockedProjectId ? projects.find((project) => project.id === lockedProjectId) ?? null : null;
  const [mode, setMode] = useState<Mode>(initialMode);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [status, setStatusLocal] = useState<TaskStatus>(task?.status ?? presetStatus ?? stages[0]?.id ?? "todo");
  const [confirmDel, setConfirmDel] = useState(false);
  const drawerRef = useRef<HTMLElement>(null);
  useDismiss(drawerRef, onClose);
  const today = new Date();

  const [form, setForm] = useState<TaskInput>({
    title: task?.title ?? "",
    division_id: task?.division_id ?? lockedProject?.division_id ?? divisions[0]?.id ?? "",
    project_id: task?.project_id ?? lockedProjectId ?? null,
    assignee_id: task?.assignee_id ?? null,
    cycle_id: task?.cycle_id ?? null,
    module_id: task?.module_id ?? null,
    parent_task_id: task?.parent_task_id ?? null,
    item_type: task?.item_type ?? "task",
    priority: task?.priority ?? "medium",
    status: task?.status ?? presetStatus ?? stages[0]?.id ?? "todo",
    due_date: task?.due_date ?? null,
    description: task?.description ?? null,
  });

  const set = <K extends keyof TaskInput>(key: K, value: TaskInput[K]) => setForm((current) => ({ ...current, [key]: value }));
  const projectsForDivision = projects.filter((project) => project.division_id === form.division_id);
  const projectCycles = cycles.filter((cycle) => cycle.project_id === (form.project_id ?? lockedProjectId ?? ""));
  const projectModules = modules.filter((module) => module.project_id === (form.project_id ?? lockedProjectId ?? ""));
  const projectEpics = epics.filter((epic) => epic.project_id === (form.project_id ?? lockedProjectId ?? "") && epic.id !== task?.id);
  const workType = typeMeta[form.item_type];
  const WorkTypeIcon = workType.Icon;
  const selectedProject = projects.find((project) => project.id === (form.project_id ?? lockedProjectId ?? "")) ?? lockedProject;
  const selectedCycle = projectCycles.find((cycle) => cycle.id === form.cycle_id) ?? null;
  const selectedModule = projectModules.find((module) => module.id === form.module_id) ?? null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    start(async () => {
      const res = mode === "create" ? await createTask(form) : await updateTask(task!.id, form);
      if ("error" in res) {
        setErr(res.error);
        return;
      }
      router.refresh();
      if (mode === "create") onClose();
      else {
        setStatusLocal(form.status);
        setMode("view");
      }
    });
  }

  function quickStatus(nextStatus: TaskStatus) {
    if (!task || nextStatus === status) return;
    setStatusLocal(nextStatus);
    start(async () => {
      const res = await setTaskStatus(task.id, nextStatus);
      if ("error" in res) {
        setErr(res.error);
        setStatusLocal(status);
        return;
      }
      router.refresh();
    });
  }

  function onDelete() {
    if (!task) return;
    start(async () => {
      const res = await deleteTask(task.id);
      if ("error" in res) {
        setErr(res.error);
        setConfirmDel(false);
        return;
      }
      router.refresh();
      onClose();
    });
  }

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={mode === "create" ? "New work item" : task?.title}>
        <aside className="drawer task-drawer" ref={drawerRef} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
          <div className="drawer-head">
            <span className="statuspill" style={{ background: `${workType.color}14`, color: workType.color, borderColor: `${workType.color}2b` }}>
              <WorkTypeIcon size={14} />
              {workType.label}
            </span>
            <button className="xbtn" onClick={onClose} aria-label="Close">
              <FiX size={16} />
            </button>
          </div>

          {/* <section className="task-drawer-hero" style={{ ["--drawer-accent" as string]: workType.color }}>
            <div className="task-drawer-hero-copy">
              <span className="task-drawer-eyebrow">{mode === "create" ? "New work item" : mode === "edit" ? "Edit work item" : "Work item details"}</span>
              <h2>{mode === "create" ? "Create a compact, structured work item" : task?.title ?? "Update work item"}</h2>
              <p>
                {mode === "view"
                  ? "Move it fast, inspect context, and jump into edits without losing the board."
                  : "Use colored controls instead of guessing raw dropdown values. Type, stage, priority, and structure are all visible at a glance."}
              </p>
            </div>
            <div className="task-drawer-hero-meta">
              <span>
                <FiLayers size={13} />
                {selectedProject?.name ?? "No project"}
              </span>
              <span>
                <FiCheckCircle size={13} />
                {activeStage?.label ?? "No stage"}
              </span>
              <span>
                <FiUsers size={13} />
                {form.assignee_id ? "Assigned" : "Unassigned"}
              </span>
            </div>
          </section> */}

          {mode === "view" && task ? (
            <>
              <div className="qstatus-bar" role="group" aria-label="Move to">
                {stages.map((stage) => (
                  <button key={stage.id} type="button" className={status === stage.id ? "on" : ""} onClick={() => quickStatus(stage.id)} disabled={pending}>
                    <span className="dot" style={{ background: stage.color }} />
                    {stage.label}
                  </button>
                ))}
              </div>

              <div className="task-detail-grid">
                <div className="task-detail-card">
                  <span className="task-detail-label">Type</span>
                  <span className="task-detail-value" style={{ color: typeMeta[task.item_type].color }}>
                    <WorkTypeIcon size={15} />
                    {typeMeta[task.item_type].label}
                  </span>
                </div>
                <div className="task-detail-card">
                  <span className="task-detail-label">Priority</span>
                  <span className="task-detail-value">
                    {(() => {
                      const PriorityIcon = PRIORITY_ICON_META[task.priority].Icon;
                      return <PriorityIcon size={16} style={{ color: PRIORITY_ICON_META[task.priority].color }} title={PRIORITY_ICON_META[task.priority].label} />;
                    })()}
                  </span>
                </div>
                <div className="task-detail-card">
                  <span className="task-detail-label">Module</span>
                  <span className="task-detail-value">{task.module_name ?? "Not set"}</span>
                </div>
                <div className="task-detail-card">
                  <span className="task-detail-label">Cycle</span>
                  <span className="task-detail-value">{task.cycle_name ?? "Not set"}</span>
                </div>
              </div>

              <div className="dmeta">
                <span className="k">Division</span><span className="v">{task.division_name.replace(/^Sthyra\s+/, "")}</span>
                <span className="k">Project</span><span className="v">{task.project_name ?? "-"}</span>
                <span className="k">Assignee</span>
                <span className="v">
                  {task.assignee_name ? (
                    <>
                      <span className="tasg" style={{ background: avatarBg(task.assignee_name) }}>{initials(task.assignee_name, null)}</span>
                      {task.assignee_name}
                    </>
                  ) : "Unassigned"}
                </span>
                <span className="k">Parent epic</span><span className="v">{task.parent_task_title ?? "-"}</span>
                <span className="k">Due</span><span className="v">{task.due_date ? dueLabel(task.due_date, today) : "-"}</span>
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
            <form onSubmit={submit} className="task-drawer-form">
              <section className="task-form-section">
                <div className="task-form-section-head">
                  <div>
                    <span className="task-form-kicker">Identity</span>
                    <strong>Type, importance, and stage</strong>
                  </div>
                </div>

                <div className="field">
                  <label className="label" htmlFor="d-title">Title</label>
                  <input id="d-title" className="input" value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="What needs doing?" autoFocus required />
                </div>

                <div className="task-choice-block">
                  <span className="label">Work item type</span>
                  <div className="task-type-choice-grid" role="group" aria-label="Work item type">
                    {typeOptions.map(([value, meta]) => {
                      const Icon = meta.Icon;
                      const active = form.item_type === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          className={`task-choice-card ${active ? "on" : ""}`}
                          onClick={() => setForm((current) => ({
                            ...current,
                            item_type: value,
                            parent_task_id: value === "epic" ? null : current.parent_task_id,
                          }))}
                          style={{ ["--choice-accent" as string]: meta.color }}
                          aria-pressed={active}
                        >
                          <span className="task-choice-icon"><Icon size={15} /></span>
                          <span>{meta.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="task-choice-block">
                  <span className="label">Priority</span>
                  <div className="task-priority-strip" role="group" aria-label="Priority">
                    {priorityOptions.map(([value, meta]) => {
                      const active = form.priority === value;
                      const PriorityIcon = meta.Icon;
                      return (
                        <button
                          key={value}
                          type="button"
                          className={`task-priority-pill ${active ? "on" : ""}`}
                          onClick={() => set("priority", value)}
                          style={{ ["--choice-accent" as string]: meta.color }}
                          title={meta.label}
                          aria-label={meta.label}
                          aria-pressed={active}
                        >
                          <PriorityIcon size={16} />
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="task-choice-block">
                  <span className="label">Stage</span>
                  <div className="task-stage-picker" role="group" aria-label="Stage">
                    {stages.map((stage) => {
                      const active = form.status === stage.id;
                      return (
                        <button
                          key={stage.id}
                          type="button"
                          className={`task-stage-chip ${active ? "on" : ""}`}
                          onClick={() => set("status", stage.id)}
                          style={{ ["--choice-accent" as string]: stage.color }}
                          aria-pressed={active}
                        >
                          <span className="task-stage-dot" style={{ background: stage.color }} />
                          {stage.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </section>

              <section className="task-form-section">
                <div className="task-form-section-head">
                  <div>
                    <span className="task-form-kicker">Placement</span>
                    <strong>Where this work belongs</strong>
                  </div>
                </div>

                <div className="field-row">
                  <div className="field">
                    <label className="label" htmlFor="d-div">Division</label>
                    <select
                      id="d-div"
                      className="select"
                      value={form.division_id}
                      onChange={(e) => setForm((current) => ({ ...current, division_id: e.target.value, project_id: null, cycle_id: null, module_id: null, parent_task_id: null }))}
                      disabled={Boolean(lockedProjectId)}
                    >
                      {divisions.map((division) => <option key={division.id} value={division.id}>{division.name.replace(/^Sthyra\s+/, "")}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label className="label" htmlFor="d-proj">Project</label>
                    <select
                      id="d-proj"
                      className="select"
                      value={form.project_id ?? ""}
                      onChange={(e) => setForm((current) => ({ ...current, project_id: e.target.value || null, cycle_id: null, module_id: null, parent_task_id: null }))}
                      disabled={Boolean(lockedProjectId)}
                    >
                      {!lockedProjectId && <option value="">- None -</option>}
                      {projectsForDivision.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                    </select>
                  </div>
                </div>

                <div className="task-context-bar">
                  <span><FiLayers size={12} />{selectedProject?.name ?? "No project selected"}</span>
                  <span><FiTarget size={12} />{projectCycles.length} cycles</span>
                  <span><FiFolder size={12} />{projectModules.length} modules</span>
                </div>
              </section>

              <section className="task-form-section">
                <div className="task-form-section-head">
                  <div>
                    <span className="task-form-kicker">Ownership</span>
                    <strong>People and structure</strong>
                  </div>
                </div>

                <div className="field-row">
                  <div className="field">
                    <label className="label" htmlFor="d-asg">Assignee</label>
                    <select id="d-asg" className="select" value={form.assignee_id ?? ""} onChange={(e) => set("assignee_id", e.target.value || null)}>
                      <option value="">- Unassigned -</option>
                      {members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label className="label" htmlFor="d-due">Due date</label>
                    <input id="d-due" type="date" className="input" value={form.due_date ?? ""} onChange={(e) => set("due_date", e.target.value || null)} />
                  </div>
                </div>

                <div className="field-row">
                  <div className="field">
                    <label className="label" htmlFor="d-cycle">Cycle</label>
                    <select id="d-cycle" className="select" value={form.cycle_id ?? ""} onChange={(e) => set("cycle_id", e.target.value || null)}>
                      <option value="">No cycle</option>
                      {projectCycles.map((cycle) => <option key={cycle.id} value={cycle.id}>{cycle.name}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label className="label" htmlFor="d-module">Module</label>
                    <select id="d-module" className="select" value={form.module_id ?? ""} onChange={(e) => set("module_id", e.target.value || null)}>
                      <option value="">No module</option>
                      {projectModules.map((module) => <option key={module.id} value={module.id}>{module.name}</option>)}
                    </select>
                  </div>
                </div>

                {form.item_type !== "epic" && (
                  <div className="field">
                    <label className="label" htmlFor="d-parent">Parent epic</label>
                    <select id="d-parent" className="select" value={form.parent_task_id ?? ""} onChange={(e) => set("parent_task_id", e.target.value || null)}>
                      <option value="">No parent epic</option>
                      {projectEpics.map((epic) => <option key={epic.id} value={epic.id}>{epic.title}</option>)}
                    </select>
                  </div>
                )}

                <div className="task-help-pills task-help-pills-rich">
                  <span>
                    <FiCalendar size={12} />
                    {form.due_date || "No due date"}
                  </span>
                  <span>
                    <FiTarget size={12} />
                    {selectedCycle?.name ?? "No cycle"}
                  </span>
                  <span>
                    <FiFolder size={12} />
                    {selectedModule?.name ?? "No module"}
                  </span>
                </div>
              </section>

              <section className="task-form-section">
                <div className="task-form-section-head">
                  <div>
                    <span className="task-form-kicker">Notes</span>
                    <strong>Details worth keeping</strong>
                  </div>
                </div>

                <div className="field">
                  <label className="label" htmlFor="d-desc">Notes</label>
                  <textarea id="d-desc" className="textarea" value={form.description ?? ""} onChange={(e) => set("description", e.target.value || null)} placeholder="Optional details, acceptance notes, debugging context, links..." />
                </div>
              </section>

              {err && <div className="form-err" role="alert">{err}</div>}
              <div className="modal-actions">
                {mode === "edit" && <button type="button" className="btn-danger" onClick={() => setConfirmDel(true)} disabled={pending}>Delete</button>}
                <button type="button" className="btn-ghost" onClick={() => (mode === "edit" ? setMode("view") : onClose())} disabled={pending}>Cancel</button>
                <button type="submit" className="btn" disabled={pending} style={{ opacity: pending ? 0.7 : 1 }}>
                  {pending ? "Saving..." : mode === "create" ? "Create work item" : "Save changes"}
                </button>
              </div>
            </form>
          )}
        </aside>
      </div>
      {confirmDel && (
        <ConfirmDialog
          title="Delete work item"
          message={`Delete "${task?.title}"? This can be restored from the database.`}
          busy={pending}
          onConfirm={onDelete}
          onCancel={() => setConfirmDel(false)}
        />
      )}
    </>
  );
}
