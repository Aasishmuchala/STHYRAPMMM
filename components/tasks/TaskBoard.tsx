"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  createProjectCycle,
  createProjectModule,
  createTaskStage,
  deleteTaskStage,
  reorderTaskStages,
  requestTaskStageDeletionApproval,
  setTaskStatus,
  updateTaskStage,
} from "@/app/tasks/actions";
import {
  DEFAULT_TASK_STAGES,
  type BoardTask,
  type CycleOpt,
  type CycleStatus,
  type DivisionOpt,
  type MemberOpt,
  type ModuleOpt,
  type ModuleStatus,
  type ProjectOpt,
  type TaskStage,
  type TaskStatus,
  type WorkItemType,
} from "@/lib/tasks-types";
import { dueLabel, initials } from "@/lib/format";
import { avatarBg } from "@/lib/avatar";
import { beginToast, finishToast } from "@/lib/client-toast";
import { TaskDrawer } from "./TaskDrawer";
import { TaskListView } from "./TaskListView";
import { TaskToolbar } from "./TaskToolbar";
import { CycleDetail } from "./CycleDetail";
import { getTaskContextLabel, getTaskDisplayKey, getTaskStageIcon, ITEM_TYPE_META, PRIORITY_ICON_META } from "./taskMeta";
import {
  FiCalendar,
  FiClock,
  FiFolder,
  FiPlus,
  FiTarget,
  FiTrendingUp,
} from "react-icons/fi";
import { HiOutlineBugAnt } from "react-icons/hi2";

const CARD_MIME = "application/x-sthyra-task-card";
const STAGE_MIME = "application/x-sthyra-task-stage";
const DELETE_APPROVAL_SESSION_KEY = "sthyra_task_stage_delete_approval";
const STAGE_COLORS = [
  { value: "#94a3b8", label: "Stone" },
  { value: "#2563eb", label: "Blue" },
  { value: "#f59e0b", label: "Amber" },
  { value: "#10b981", label: "Green" },
  { value: "#ef4444", label: "Red" },
];
const MODULE_COLORS = ["#2563eb", "#0ea5e9", "#14b8a6", "#10b981", "#f59e0b", "#f97316", "#ef4444"];
const cycleStatusMeta: Record<CycleStatus, { label: string; color: string }> = {
  planned: { label: "Planned", color: "#f59e0b" },
  active: { label: "Active", color: "#10b981" },
  completed: { label: "Completed", color: "#2563eb" },
};
const moduleStatusMeta: Record<ModuleStatus, { label: string; color: string }> = {
  planned: { label: "Planned", color: "#f59e0b" },
  active: { label: "Active", color: "#10b981" },
  archived: { label: "Archived", color: "#94a3b8" },
};
type GroupBy = "none" | "project" | "division";
type TabKey = "overview" | "work-items" | "epics" | "cycles" | "modules";
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

function buildTasksHref(searchParams: URLSearchParams, patch: Record<string, string | null | undefined>) {
  const next = new URLSearchParams(searchParams.toString());
  for (const [key, value] of Object.entries(patch)) {
    if (value) next.set(key, value);
    else next.delete(key);
  }
  const query = next.toString();
  return query ? `/tasks?${query}` : "/tasks";
}

const MONTH_LABEL_FORMATTER = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" });
const WINDOW_LABEL_FORMATTER = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

function parseDateValue(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function formatRoadmapWindow(start: Date, end: Date) {
  if (start.toDateString() === end.toDateString()) {
    return WINDOW_LABEL_FORMATTER.format(start);
  }
  return `${WINDOW_LABEL_FORMATTER.format(start)} - ${WINDOW_LABEL_FORMATTER.format(end)}`;
}

export function TaskBoard({
  tasks,
  stages,
  divisions,
  projects,
  members,
  cycles,
  modules,
  currentUserId,
  canManageWorkflow,
  canCreateTasks,
  initialDivision,
  activeProjectId,
  initialView = "board",
  initialTab = "work-items",
  initialCycleId = null,
  initialModuleId = null,
  initialAssignee = "all",
}: {
  tasks: BoardTask[];
  stages: TaskStage[];
  divisions: DivisionOpt[];
  projects: ProjectOpt[];
  members: MemberOpt[];
  cycles: CycleOpt[];
  modules: ModuleOpt[];
  currentUserId: string;
  canManageWorkflow: boolean;
  canCreateTasks: boolean;
  initialDivision?: string;
  activeProjectId: string | null;
  initialView?: "board" | "list";
  initialTab?: TabKey;
  initialCycleId?: string | null;
  initialModuleId?: string | null;
  initialAssignee?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, start] = useTransition();
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  const [divFilter, setDivFilter] = useState(initialDivision ?? "all");
  const [asgFilter, setAsgFilter] = useState(initialAssignee);
  const [typeFilter, setTypeFilter] = useState<"all" | WorkItemType>("all");
  const [cycleFilter, setCycleFilter] = useState(initialCycleId ?? "all");
  const [moduleFilter, setModuleFilter] = useState(initialModuleId ?? "all");
  const [mineOnly, setMineOnly] = useState(false);
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  const [viewMode, setViewMode] = useState<"board" | "list">(initialView);
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
    color: "#2563eb",
    is_done: false,
    after_stage_id: "",
  });
  const [cycleForm, setCycleForm] = useState({
    name: "",
    goal: "",
    starts_on: "",
    ends_on: "",
    status: "planned" as CycleStatus,
  });
  const [moduleForm, setModuleForm] = useState({
    name: "",
    description: "",
    color: MODULE_COLORS[0],
    lead_id: "",
    status: "active" as ModuleStatus,
  });
  const [cycleList, setCycleList] = useState(cycles);
  const [moduleList, setModuleList] = useState(modules);
  const [openCycleId, setOpenCycleId] = useState<string | null>(null);
  const justDraggedRef = useRef(false);
  const today = new Date();
  const activeProject = projects.find((project) => project.id === activeProjectId) ?? null;
  const isDraggingTask = draggingId !== null;
  const isDraggingStage = draggingStageId !== null;

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    setBoardTasks(tasks);
  }, [tasks]);

  useEffect(() => {
    setCycleList(cycles);
  }, [cycles]);

  useEffect(() => {
    setModuleList(modules);
  }, [modules]);

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
    setCycleFilter(initialCycleId ?? "all");
  }, [initialCycleId]);

  useEffect(() => {
    setModuleFilter(initialModuleId ?? "all");
  }, [initialModuleId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const approvedUser = window.sessionStorage.getItem(DELETE_APPROVAL_SESSION_KEY);
    setDeleteApproved(approvedUser === currentUserId);
  }, [currentUserId]);

  useEffect(() => {
    setWorkflowOpen(false);
  }, [activeProjectId]);

  const defaultCreateStage = useMemo(
    () => stageList.find((stage) => !stage.is_done)?.id ?? stageList[0]?.id ?? "todo",
    [stageList]
  );
  const filtered = useMemo(
    () => boardTasks.filter(
      (task) =>
        (divFilter === "all" || task.division_slug === divFilter) &&
        (asgFilter === "all" || (asgFilter === "unassigned" ? !task.assignee_id : task.assignee_id === asgFilter)) &&
        (typeFilter === "all" || task.item_type === typeFilter) &&
        (cycleFilter === "all" || task.cycle_id === cycleFilter) &&
        (moduleFilter === "all" || task.module_id === moduleFilter) &&
        (!mineOnly || task.assignee_id === currentUserId)
    ),
    [boardTasks, divFilter, asgFilter, typeFilter, cycleFilter, moduleFilter, mineOnly, currentUserId]
  );
  const boardWorkItems = useMemo(() => boardTasks.filter((task) => task.item_type !== "epic"), [boardTasks]);
  const filteredBoardItems = useMemo(() => filtered.filter((task) => task.item_type !== "epic"), [filtered]);
  const filteredEpics = useMemo(() => filtered.filter((task) => task.item_type === "epic"), [filtered]);
  const epicOptions = useMemo(() => boardTasks.filter((task) => task.item_type === "epic"), [boardTasks]);
  const epicChildCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const task of boardWorkItems) {
      if (!task.parent_task_id) continue;
      counts.set(task.parent_task_id, (counts.get(task.parent_task_id) ?? 0) + 1);
    }
    return counts;
  }, [boardWorkItems]);
  const epicRoadmap = useMemo(() => {
    const todayDate = startOfDay(new Date());
    const cycleById = new Map(cycleList.map((cycle) => [cycle.id, cycle]));
    const moduleById = new Map(moduleList.map((moduleEntry) => [moduleEntry.id, moduleEntry]));

    const rows = filteredEpics.map((epic, index) => {
      const stage = stageList.find((item) => item.id === epic.status) ?? null;
      const cycle = epic.cycle_id ? cycleById.get(epic.cycle_id) ?? null : null;
      const moduleEntry = epic.module_id ? moduleById.get(epic.module_id) ?? null : null;
      const cycleStart = parseDateValue(cycle?.starts_on);
      const cycleEnd = parseDateValue(cycle?.ends_on);
      const dueDate = parseDateValue(epic.due_date);
      const fallbackStart = dueDate ? addDays(dueDate, -9) : addDays(todayDate, index * 7);
      const fallbackEnd = dueDate ? dueDate : addDays(fallbackStart, 12);
      const startDate = cycleStart ?? (cycleEnd ? addDays(cycleEnd, -13) : fallbackStart);
      const endDate = cycleEnd ?? (cycleStart ? addDays(cycleStart, 13) : fallbackEnd);
      const safeEnd = endDate.getTime() < startDate.getTime() ? startDate : endDate;

      return {
        task: epic,
        stage,
        childCount: epicChildCounts.get(epic.id) ?? 0,
        projectName: epic.project_name ?? activeProject?.name ?? "No project",
        assigneeName: epic.assignee_name ?? "Unassigned",
        cycleName: cycle?.name ?? null,
        moduleName: moduleEntry?.name ?? epic.module_name ?? null,
        startDate,
        endDate: safeEnd,
        windowLabel: formatRoadmapWindow(startDate, safeEnd),
        barColor: moduleEntry?.color ?? stage?.color ?? "#2563eb",
      };
    });

    const timelineStart = rows.length
      ? startOfMonth(rows.reduce((min, row) => (row.startDate.getTime() < min.getTime() ? row.startDate : min), rows[0].startDate))
      : startOfMonth(todayDate);
    let timelineEnd = rows.length
      ? endOfMonth(rows.reduce((max, row) => (row.endDate.getTime() > max.getTime() ? row.endDate : max), rows[0].endDate))
      : endOfMonth(addMonths(todayDate, 5));
    const minimumTimelineEnd = endOfMonth(addMonths(timelineStart, 5));
    if (timelineEnd.getTime() < minimumTimelineEnd.getTime()) {
      timelineEnd = minimumTimelineEnd;
    }

    const months: { key: string; label: string }[] = [];
    for (let cursor = startOfMonth(timelineStart); cursor.getTime() <= timelineEnd.getTime(); cursor = addMonths(cursor, 1)) {
      months.push({
        key: `${cursor.getFullYear()}-${cursor.getMonth()}`,
        label: MONTH_LABEL_FORMATTER.format(cursor),
      });
    }

    const totalDays = Math.max(1, Math.ceil((timelineEnd.getTime() - timelineStart.getTime()) / 86400000) + 1);
    const positionedRows = rows.map((row) => {
      const startOffset = Math.max(0, Math.floor((row.startDate.getTime() - timelineStart.getTime()) / 86400000));
      const endOffset = Math.max(startOffset + 1, Math.ceil((row.endDate.getTime() - timelineStart.getTime()) / 86400000) + 1);
      return {
        ...row,
        left: (startOffset / totalDays) * 100,
        width: Math.max(((endOffset - startOffset) / totalDays) * 100, 7),
      };
    });

    return { months, rows: positionedRows };
  }, [activeProject?.name, cycleList, epicChildCounts, filteredEpics, moduleList, stageList]);

  function canMoveTask(task: BoardTask) {
    return canManageWorkflow || task.assignee_id === currentUserId;
  }

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
    router.push(buildTasksHref(new URLSearchParams(searchParams.toString()), { project: projectId, cycle: null, module: null }));
  }

  function openCycle(cycleId: string) {
    setActiveTab("work-items");
    router.push(buildTasksHref(new URLSearchParams(searchParams.toString()), { tab: "work-items", cycle: cycleId, module: null }));
  }

  function openModule(moduleId: string) {
    setActiveTab("work-items");
    router.push(buildTasksHref(new URLSearchParams(searchParams.toString()), { tab: "work-items", module: moduleId, cycle: null }));
  }

  function syncTaskCycles(taskIds: string[], nextCycleId: string | null) {
    const cycleName = nextCycleId ? (cycleList.find((cycle) => cycle.id === nextCycleId)?.name ?? null) : null;
    setBoardTasks((current) => current.map((task) => (
      taskIds.includes(task.id)
        ? { ...task, cycle_id: nextCycleId, cycle_name: cycleName }
        : task
    )));
  }

  function handleTaskDrop(status: TaskStatus, taskId: string) {
    const previousTasks = boardTasks;
    const task = boardTasks.find((item) => item.id === taskId);
    if (!task || !canMoveTask(task)) {
      setBoardError("You can only move tasks assigned to you.");
      setDraggingId(null);
      setDragSourceStatus(null);
      setDragOverCol(null);
      return;
    }
    setBoardError(null);
    setDraggingId(null);
    setDragSourceStatus(null);
    setDragOverCol(null);
    setBoardTasks((current) => current.map((task) => (task.id === taskId ? { ...task, status } : task)));
    start(async () => {
      const toastId = beginToast("Moving work item...");
      const res = await setTaskStatus(taskId, status);
      if (!finishToast(res, { id: toastId, success: "Work item moved." })) {
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
      const toastId = beginToast("Reordering workflow...");
      const res = await reorderTaskStages(activeProjectId, reordered.map((stage) => stage.id));
      if (!finishToast(res, { id: toastId, success: "Workflow updated." })) {
        setBoardError(res.error);
        setStageList(previousStages);
        return;
      }
      router.refresh();
    });
  }

  function onDrop(targetStageId: string, event: React.DragEvent) {
    event.preventDefault();
    const stageId = event.dataTransfer.getData(STAGE_MIME) || draggingStageId;
    if (stageId) {
      handleStageReorder(stageId, targetStageId);
      return;
    }

    const taskId = event.dataTransfer.getData(CARD_MIME) || event.dataTransfer.getData("text/plain") || draggingId;
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
      const toastId = beginToast("Saving workflow stage...");
      const res = await updateTaskStage(activeProjectId, stageId, draft);
      if (!finishToast(res, { id: toastId, success: "Workflow stage saved." })) {
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
      setDeleteErr("Choose where the remaining work items should move first.");
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

    const toastId = beginToast("Deleting workflow stage...");
    const res = await deleteTaskStage({
      project_id: activeProjectId,
      stage_id: deleteDialog.id,
      move_tasks_to: targetStageId,
    });

    if (!finishToast(res, { id: toastId, success: "Workflow stage deleted." })) {
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

  function addStage(event: React.FormEvent) {
    event.preventDefault();
    if (!activeProjectId) return;
    setBoardError(null);
    start(async () => {
      const toastId = beginToast("Creating workflow stage...");
      const res = await createTaskStage({
        project_id: activeProjectId,
        label: newStage.label,
        color: newStage.color,
        is_done: newStage.is_done,
        after_stage_id: newStage.after_stage_id || null,
      });
      if (!finishToast(res, { id: toastId, success: "Workflow stage created." })) {
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
        color: "#2563eb",
        is_done: false,
        after_stage_id: res.data.id,
      });
      router.refresh();
    });
  }

  function submitCycle(event: React.FormEvent) {
    event.preventDefault();
    if (!activeProjectId) return;
    setBoardError(null);
    start(async () => {
      const toastId = beginToast("Creating cycle...");
      const res = await createProjectCycle({
        project_id: activeProjectId,
        name: cycleForm.name,
        goal: cycleForm.goal,
        starts_on: cycleForm.starts_on || null,
        ends_on: cycleForm.ends_on || null,
        status: cycleForm.status,
      });
      if (!finishToast(res, { id: toastId, success: "Cycle created." })) {
        setBoardError(res.error);
        return;
      }

      setCycleList((current) => [res.data, ...current]);
      setCycleForm({ name: "", goal: "", starts_on: "", ends_on: "", status: "planned" });
      router.refresh();
    });
  }

  function submitModule(event: React.FormEvent) {
    event.preventDefault();
    if (!activeProjectId) return;
    setBoardError(null);
    start(async () => {
      const toastId = beginToast("Creating module...");
      const res = await createProjectModule({
        project_id: activeProjectId,
        name: moduleForm.name,
        description: moduleForm.description,
        color: moduleForm.color,
        lead_id: moduleForm.lead_id || null,
        status: moduleForm.status,
      });
      if (!finishToast(res, { id: toastId, success: "Module created." })) {
        setBoardError(res.error);
        return;
      }

      setModuleList((current) => [res.data, ...current]);
      setModuleForm({ name: "", description: "", color: MODULE_COLORS[currentMinute()], lead_id: "", status: "active" });
      router.refresh();
    });
  }

  function currentMinute() {
    return new Date().getMinutes() % MODULE_COLORS.length;
  }

  const summary = {
    filtered: filteredBoardItems.length,
    openItems: boardWorkItems.filter((task) => !stageList.find((stage) => stage.id === task.status)?.is_done).length,
    doneItems: boardWorkItems.filter((task) => stageList.find((stage) => stage.id === task.status)?.is_done).length,
    epics: boardTasks.filter((task) => task.item_type === "epic").length,
    bugs: boardWorkItems.filter((task) => task.item_type === "bug").length,
    overdue: boardWorkItems.filter((task) => {
      if (!task.due_date) return false;
      const isDone = stageList.find((stage) => stage.id === task.status)?.is_done;
      return !isDone && new Date(task.due_date).getTime() < today.getTime();
    }).length,
  };
  const activeCycle = cycleList.find((cycle) => cycle.status === "active") ?? cycleList[0] ?? null;

  function Card({ task }: { task: BoardTask }) {
    const typeMeta = ITEM_TYPE_META[task.item_type];
    const TypeIcon = typeMeta.Icon;
    const priority = PRIORITY_ICON_META[task.priority];
    const PriorityIcon = priority.Icon;
    const displayKey = getTaskDisplayKey(task);
    const contextLabel = getTaskContextLabel(task);
    const draggable = canMoveTask(task);
    return (
      <article
        className={`task-card ${draggingId === task.id ? "dragging" : ""}`}
        draggable={draggable}
        onDragStart={(event) => {
          if (!draggable) {
            event.preventDefault();
            return;
          }
          justDraggedRef.current = true;
          setDraggingId(task.id);
          setDragSourceStatus(task.status);
          setDraggingStageId(null);
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData(CARD_MIME, task.id);
          event.dataTransfer.setData("text/plain", task.id);
        }}
        onDragEnd={() => {
          setDraggingId(null);
          setDragSourceStatus(null);
          setDragOverCol(null);
          window.setTimeout(() => {
            justDraggedRef.current = false;
          }, 140);
        }}
        onClick={(event) => {
          if (justDraggedRef.current) {
            event.preventDefault();
            event.stopPropagation();
            justDraggedRef.current = false;
            return;
          }
          setDrawer({ mode: "view", task });
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") setDrawer({ mode: "view", task });
        }}
        role="button"
        tabIndex={0}
        aria-label={`Open ${task.title}`}
      >
        <div className="task-card-topline">
          <span className="task-card-keymeta">
            <span className="task-card-typebox" style={{ background: `${typeMeta.color}14`, color: typeMeta.color }}>
              <TypeIcon size={14} />
            </span>
            <span className="task-card-key">{displayKey}</span>
          </span>
        </div>
        <div className="task-card-title">{task.title}</div>
        <div className="task-card-bottomline">
          <div className="task-card-meta-inline">
            {task.assignee_name ? (
              <span className="task-avatar" style={{ background: avatarBg(task.assignee_name) }} title={task.assignee_name}>
                {initials(task.assignee_name, null)}
              </span>
            ) : (
              <span className="task-card-assignee-empty">Unassigned</span>
            )}
            {contextLabel && <span className="task-card-context">{contextLabel}</span>}
            {task.due_date && (
              <span className="task-card-date">
                <FiCalendar size={12} />
                {dueLabel(task.due_date, today)}
              </span>
            )}
          </div>
            <span className="task-priority-icon" title={priority.label} aria-label={priority.label} style={{ ["--priority-color" as string]: priority.color }}>
            <PriorityIcon size={16} />
          </span>
        </div>
      </article>
    );
  }

  return (
    <>
      {activeProjectId && activeProject && (
        <div className="tasks-project-strip" aria-label="Current project controls">
          <label className="field tasks-project-field">
            <span className="label">Current project</span>
            <select className="select tasks-project-select" value={activeProjectId} onChange={(event) => switchProject(event.target.value)}>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </select>
          </label>
        </div>
      )}

      {boardError && <div className="form-err" role="alert" style={{ marginBottom: 18 }}>{boardError}</div>}

      {activeTab === "overview" && (
        <section className="tasks-overview-grid" aria-label="Project overview">
          <article className="tasks-panel">
            <div className="tasks-panel-head">
              <div>
                <div className="workspace-tag">Delivery snapshot</div>
                <h3>What needs attention</h3>
                <p className="tasks-panel-copy">A tighter overview of work, planning, and delivery health without repeating the whole page.</p>
              </div>
            </div>
            <div className="overview-list">
              <div className="overview-row">
                <span className="overview-row-icon blue"><FiTrendingUp size={15} /></span>
                <div>
                  <strong>{summary.openItems} open items</strong>
                  <span>{summary.filtered} work items match the current filters.</span>
                </div>
              </div>
              <div className="overview-row">
                <span className="overview-row-icon amber"><FiClock size={15} /></span>
                <div>
                  <strong>{summary.overdue} overdue items</strong>
                  <span>Due dates stay visible in cards and list rows for quicker triage.</span>
                </div>
              </div>
              <div className="overview-row">
                <span className="overview-row-icon green"><FiTarget size={15} /></span>
                <div>
                  <strong>{activeCycle?.name ?? "No active cycle"}</strong>
                  <span>{activeCycle ? cycleStatusMeta[activeCycle.status].label : "Create a cycle when you want sprint-style planning."}</span>
                </div>
              </div>
              <div className="overview-row">
                <span className="overview-row-icon red"><HiOutlineBugAnt size={15} /></span>
                <div>
                  <strong>{summary.bugs} bugs tracked</strong>
                  <span>{summary.epics} epics are currently structuring the backlog.</span>
                </div>
              </div>
            </div>
          </article>

          <article className="tasks-panel">
            <div className="tasks-panel-head">
              <div>
                <div className="workspace-tag">Stage health</div>
                <h3>Board progress</h3>
              </div>
            </div>
            <div className="overview-stack">
              {stageList.map((stage) => {
                const count = boardTasks.filter((task) => task.status === stage.id).length;
                return (
                  <div key={stage.id} className="overview-link-card static">
                    <span className="overview-link-dot" style={{ background: stage.color }} />
                    <div>
                      <strong>{stage.label}</strong>
                      <span>{count} items</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </article>

          <article className="tasks-panel">
            <div className="tasks-panel-head">
              <div>
                <div className="workspace-tag">Cycles</div>
                <h3>Planning windows</h3>
              </div>
            </div>
            <div className="overview-stack">
              {cycleList.length === 0 ? (
                <div className="overview-empty">No cycles yet. Create one from the Cycles tab when you want a named planning window.</div>
              ) : (
                cycleList.slice(0, 5).map((cycle) => {
                  const count = boardTasks.filter((task) => task.cycle_id === cycle.id).length;
                  return (
                    <button key={cycle.id} type="button" className="overview-link-card" onClick={() => openCycle(cycle.id)}>
                      <span className="overview-link-dot" style={{ background: cycleStatusMeta[cycle.status].color }} />
                      <div>
                        <strong>{cycle.name}</strong>
                        <span>{count} linked work items</span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </article>

          <article className="tasks-panel">
            <div className="tasks-panel-head">
              <div>
                <div className="workspace-tag">Modules</div>
                <h3>Delivery areas</h3>
              </div>
            </div>
            <div className="overview-stack">
              {moduleList.length === 0 ? (
                <div className="overview-empty">No modules yet. Add one from the Modules tab to group work by stream or functional area.</div>
              ) : (
                moduleList.slice(0, 5).map((module) => {
                  const count = boardTasks.filter((task) => task.module_id === module.id).length;
                  return (
                    <button key={module.id} type="button" className="overview-link-card" onClick={() => openModule(module.id)}>
                      <span className="overview-link-dot" style={{ background: module.color }} />
                      <div>
                        <strong>{module.name}</strong>
                        <span>{count} linked work items</span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </article>
        </section>
      )}

      {activeTab === "cycles" && (
        <section className="tasks-tab-grid" aria-label="Cycles">
          {canManageWorkflow && (
            <article className="tasks-panel">
              <div className="tasks-panel-head">
                <div>
                  <div className="workspace-tag">New cycle</div>
                  <h3>Create a planning window</h3>
                </div>
              </div>
              <form onSubmit={submitCycle} className="tasks-form-stack">
                <label className="field">
                  <span className="label">Cycle name</span>
                  <input className="input" value={cycleForm.name} onChange={(event) => setCycleForm((current) => ({ ...current, name: event.target.value }))} placeholder="Sprint 12, Launch prep, Client review..." />
                </label>
                <label className="field">
                  <span className="label">Goal</span>
                  <textarea className="textarea" value={cycleForm.goal} onChange={(event) => setCycleForm((current) => ({ ...current, goal: event.target.value }))} placeholder="What should this cycle accomplish?" />
                </label>
                <div className="field-row">
                  <label className="field">
                    <span className="label">Start</span>
                    <input type="date" className="input" value={cycleForm.starts_on} onChange={(event) => setCycleForm((current) => ({ ...current, starts_on: event.target.value }))} />
                  </label>
                  <label className="field">
                    <span className="label">End</span>
                    <input type="date" className="input" value={cycleForm.ends_on} onChange={(event) => setCycleForm((current) => ({ ...current, ends_on: event.target.value }))} />
                  </label>
                </div>
                <label className="field">
                  <span className="label">Status</span>
                  <select className="select" value={cycleForm.status} onChange={(event) => setCycleForm((current) => ({ ...current, status: event.target.value as CycleStatus }))}>
                    <option value="planned">Planned</option>
                    <option value="active">Active</option>
                    <option value="completed">Completed</option>
                  </select>
                </label>
                <button type="submit" className="btn">
                  <FiPlus size={14} />
                  Create cycle
                </button>
              </form>
            </article>
          )}

          <article className="tasks-panel tasks-panel-span">
            <div className="tasks-panel-head">
              <div>
                <div className="workspace-tag">Cycle list</div>
                <h3>Open and completed windows</h3>
              </div>
            </div>
            <div className="planning-card-grid">
              {cycleList.length === 0 ? (
                <div className="planning-empty">No cycles yet. Create the first one to group work into a named delivery window.</div>
              ) : (
                cycleList.map((cycle) => {
                  const count = boardTasks.filter((task) => task.cycle_id === cycle.id).length;
                  const doneCount = boardTasks.filter((task) => task.cycle_id === cycle.id && stageList.find((stage) => stage.id === task.status)?.is_done).length;
                  return (
                    <article key={cycle.id} className="planning-card">
                      <div className="planning-card-head">
                        <span className="planning-status" style={{ background: `${cycleStatusMeta[cycle.status].color}16`, color: cycleStatusMeta[cycle.status].color }}>
                          <FiTarget size={14} />
                          {cycleStatusMeta[cycle.status].label}
                        </span>
                        <span className="planning-count">{count} items</span>
                      </div>
                      <h4>{cycle.name}</h4>
                      <p>{cycle.goal || "No goal added yet."}</p>
                      <div className="planning-progress">
                        <span>{doneCount}/{count || 0} done</span>
                        <span>{cycle.starts_on || "No start"} - {cycle.ends_on || "No end"}</span>
                      </div>
                      <div className="planning-card-actions">
                        <button type="button" className="btn" onClick={() => setOpenCycleId(cycle.id)}>
                          Manage cycle
                        </button>
                        <button type="button" className="btn-ghost" onClick={() => openCycle(cycle.id)}>
                          Open work items
                        </button>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
            {openCycleId && (() => {
              const selectedCycle = cycleList.find((c) => c.id === openCycleId);
              if (!selectedCycle) return null;
              return (
                <CycleDetail
                  cycle={selectedCycle}
                  projectTasks={boardTasks}
                  otherCycles={cycleList.filter((c) => c.id !== selectedCycle.id)}
                  members={members}
                  stages={stageList}
                  canManage={canManageWorkflow}
                  onCycleTasksChanged={syncTaskCycles}
                />
              );
            })()}
            {openCycleId && (
              <div className="cycle-detail-close">
                <button type="button" className="btn-ghost" onClick={() => setOpenCycleId(null)}>
                  Close cycle editor
                </button>
              </div>
            )}
          </article>
        </section>
      )}

      {activeTab === "modules" && (
        <section className="tasks-tab-grid" aria-label="Modules">
          {canManageWorkflow && (
            <article className="tasks-panel">
              <div className="tasks-panel-head">
                <div>
                  <div className="workspace-tag">New module</div>
                  <h3>Create a delivery stream</h3>
                </div>
              </div>
              <form onSubmit={submitModule} className="tasks-form-stack">
                <label className="field">
                  <span className="label">Module name</span>
                  <input className="input" value={moduleForm.name} onChange={(event) => setModuleForm((current) => ({ ...current, name: event.target.value }))} placeholder="Mobile app, Billing, Interiors, Handover..." />
                </label>
                <label className="field">
                  <span className="label">Description</span>
                  <textarea className="textarea" value={moduleForm.description} onChange={(event) => setModuleForm((current) => ({ ...current, description: event.target.value }))} placeholder="What part of the project does this module cover?" />
                </label>
                <div className="field-row">
                  <label className="field">
                    <span className="label">Color</span>
                    <div className="color-swatch-row" role="list" aria-label="Module colors">
                      {MODULE_COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          className={`color-swatch ${moduleForm.color === color ? "on" : ""}`}
                          onClick={() => setModuleForm((current) => ({ ...current, color }))}
                          aria-label={`Select ${color}`}
                          title={color}
                          style={{ background: color }}
                        />
                      ))}
                    </div>
                  </label>
                  <label className="field">
                    <span className="label">Lead</span>
                    <select className="select" value={moduleForm.lead_id} onChange={(event) => setModuleForm((current) => ({ ...current, lead_id: event.target.value }))}>
                      <option value="">Unassigned</option>
                      {members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
                    </select>
                  </label>
                </div>
                <label className="field">
                  <span className="label">Status</span>
                  <select className="select" value={moduleForm.status} onChange={(event) => setModuleForm((current) => ({ ...current, status: event.target.value as ModuleStatus }))}>
                    <option value="planned">Planned</option>
                    <option value="active">Active</option>
                    <option value="archived">Archived</option>
                  </select>
                </label>
                <button type="submit" className="btn">
                  <FiPlus size={14} />
                  Create module
                </button>
              </form>
            </article>
          )}

          <article className="tasks-panel tasks-panel-span">
            <div className="tasks-panel-head">
              <div>
                <div className="workspace-tag">Module list</div>
                <h3>Areas organizing the backlog</h3>
              </div>
            </div>
            <div className="planning-card-grid">
              {moduleList.length === 0 ? (
                <div className="planning-empty">No modules yet. Add one to organize the board beyond a flat task list.</div>
              ) : (
                moduleList.map((module) => {
                  const count = boardTasks.filter((task) => task.module_id === module.id).length;
                  return (
                    <article key={module.id} className="planning-card">
                      <div className="planning-card-head">
                        <span className="planning-status" style={{ background: `${module.color}16`, color: module.color }}>
                          <FiFolder size={14} />
                          {moduleStatusMeta[module.status].label}
                        </span>
                        <span className="planning-count">{count} items</span>
                      </div>
                      <h4>{module.name}</h4>
                      <p>{module.description || "No description yet."}</p>
                      <div className="planning-progress">
                        <span>{module.lead_name ?? "No lead assigned"}</span>
                        <span>{module.color}</span>
                      </div>
                      <button type="button" className="btn-ghost" onClick={() => openModule(module.id)}>
                        Open work items
                      </button>
                    </article>
                  );
                })
              )}
            </div>
          </article>
        </section>
      )}

      {(activeTab === "work-items" || activeTab === "epics") && (
        <>
          <TaskToolbar
            view={viewMode}
            onViewChange={setViewMode}
            divFilter={divFilter}
            onDivFilterChange={setDivFilter}
            asgFilter={asgFilter}
            onAsgFilterChange={setAsgFilter}
            typeFilter={typeFilter}
            onTypeFilterChange={setTypeFilter}
            cycleFilter={cycleFilter}
            onCycleFilterChange={setCycleFilter}
            moduleFilter={moduleFilter}
            onModuleFilterChange={setModuleFilter}
            groupBy={groupBy}
            onGroupByChange={setGroupBy}
            mineOnly={mineOnly}
            onToggleMineOnly={() => setMineOnly((value) => !value)}
            divisions={divisions}
            members={members}
            cycles={cycleList}
            modules={moduleList}
            canManageWorkflow={canManageWorkflow}
            canAdd={canCreateTasks}
            workflowOpen={workflowOpen}
            onToggleWorkflow={() => setWorkflowOpen((value) => !value)}
            onAdd={() => {
              if (!canCreateTasks) return;
              setDrawer({ mode: "create", presetStatus: defaultCreateStage });
            }}
          />

          {canManageWorkflow && workflowOpen && (
            <section className="tasks-panel" aria-label="Workflow editor">
              <div className="tasks-panel-head">
                <div>
                  <div className="workspace-tag">Workflow editor</div>
                  <h3>Shape this project&apos;s board</h3>
                  <p className="tasks-panel-copy">Drag to reorder. Owners and leads can also rename, recolor, mark done columns, and delete stages safely.</p>
                </div>
              </div>
              <div className="workflow-grid">
                {stageList.map((stage) => {
                  const draft = stageDrafts[stage.id] ?? { label: stage.label, color: stage.color, is_done: stage.is_done };
                  return (
                    <div key={stage.id} className="workflow-card">
                      <div className="workflow-card-head">
                        <span className="statuspill">
                          <span className="workflow-color-dot" style={{ background: draft.color }} />
                          {stage.key}
                        </span>
                        <span className="workflow-hint">Project stage</span>
                      </div>
                      <label className="field">
                        <span className="label">Stage name</span>
                        <input className="input" value={draft.label} onChange={(event) => updateDraft(stage.id, { label: event.target.value })} />
                      </label>
                      <div className="field-row">
                        <label className="field">
                          <span className="label">Color</span>
                          <div className="color-swatch-row" role="list" aria-label="Stage colors">
                            {STAGE_COLORS.map((color) => (
                              <button
                                key={color.value}
                                type="button"
                                className={`color-swatch ${draft.color === color.value ? "on" : ""}`}
                                onClick={() => updateDraft(stage.id, { color: color.value })}
                                aria-label={color.label}
                                title={color.label}
                                style={{ background: color.value }}
                              />
                            ))}
                          </div>
                        </label>
                        <label className="field workflow-check">
                          <span className="label">Done column</span>
                          <input type="checkbox" checked={draft.is_done} onChange={(event) => updateDraft(stage.id, { is_done: event.target.checked })} />
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
                    <span className="statuspill">
                      <FiPlus size={12} />
                      New stage
                    </span>
                  </div>
                  <label className="field">
                    <span className="label">Stage name</span>
                    <input className="input" value={newStage.label} onChange={(event) => setNewStage((current) => ({ ...current, label: event.target.value }))} placeholder="Blocked, QA, Ready for client..." />
                  </label>
                  <div className="field-row">
                    <label className="field">
                      <span className="label">Insert after</span>
                      <select className="select" value={newStage.after_stage_id} onChange={(event) => setNewStage((current) => ({ ...current, after_stage_id: event.target.value }))}>
                        {stageList.map((stage) => <option key={stage.id} value={stage.id}>{stage.label}</option>)}
                      </select>
                    </label>
                    <label className="field">
                      <span className="label">Color</span>
                      <div className="color-swatch-row" role="list" aria-label="New stage colors">
                        {STAGE_COLORS.map((color) => (
                          <button
                            key={color.value}
                            type="button"
                            className={`color-swatch ${newStage.color === color.value ? "on" : ""}`}
                            onClick={() => setNewStage((current) => ({ ...current, color: color.value }))}
                            aria-label={color.label}
                            title={color.label}
                            style={{ background: color.value }}
                          />
                        ))}
                      </div>
                    </label>
                  </div>
                  <label className="field workflow-check">
                    <span className="label">Treat as done</span>
                    <input type="checkbox" checked={newStage.is_done} onChange={(event) => setNewStage((current) => ({ ...current, is_done: event.target.checked }))} />
                  </label>
                  <div className="workflow-actions">
                    <button type="submit" className="btn">Add stage</button>
                  </div>
                </form>
              </div>
            </section>
          )}

          {activeTab === "epics" ? (
            <section className="tasks-panel epic-roadmap-shell" aria-label="Epic roadmap">
              <div className="tasks-panel-head epic-roadmap-head">
                <div>
                  <div className="workspace-tag">Epic roadmap</div>
                  <h3>Planning stays separate from day-to-day delivery</h3>
                  <p className="tasks-panel-copy">Epics live in a dedicated timeline view so the Kanban stays focused on execution work, not planning containers.</p>
                </div>
                <div className="epic-roadmap-head-stats" aria-label="Epic roadmap summary">
                  <span>{filteredEpics.length} epics</span>
                  <span>{filteredEpics.filter((epic) => epic.cycle_id).length} linked to cycles</span>
                  <span>{filteredEpics.filter((epic) => epic.assignee_id).length} assigned</span>
                </div>
              </div>
              {epicRoadmap.rows.length === 0 ? (
                <div className="planning-empty epic-roadmap-empty">
                  No epics match these filters yet. Create one or loosen the filters to populate the roadmap.
                </div>
              ) : (
                <div className="epic-roadmap-board">
                  <div className="epic-roadmap-top">
                    <div className="epic-roadmap-column-labels">
                      <span>Epic</span>
                      <span>Status</span>
                      <span>Owner</span>
                      <span>Window</span>
                    </div>
                    <div
                      className="epic-roadmap-months"
                      style={{ gridTemplateColumns: `repeat(${epicRoadmap.months.length}, minmax(120px, 1fr))` }}
                    >
                      {epicRoadmap.months.map((month) => (
                        <span key={month.key}>{month.label}</span>
                      ))}
                    </div>
                  </div>

                  <div className="epic-roadmap-rows">
                    {epicRoadmap.rows.map((row) => {
                      const StageIcon = row.stage ? getTaskStageIcon(row.stage) : FiTarget;
                      const displayKey = getTaskDisplayKey(row.task);
                      return (
                        <button
                          key={row.task.id}
                          type="button"
                          className="epic-roadmap-row"
                          onClick={() => setDrawer({ mode: "view", task: row.task })}
                        >
                          <div className="epic-roadmap-meta">
                            <div className="epic-roadmap-issue">
                              <div className="epic-roadmap-issue-top">
                                <span className="epic-roadmap-key">{displayKey}</span>
                                <span className="epic-roadmap-type">Epic</span>
                              </div>
                              <strong>{row.task.title}</strong>
                              <span className="epic-roadmap-subcopy">
                                {row.projectName}
                                {row.moduleName ? ` · ${row.moduleName}` : ""}
                                {row.childCount > 0 ? ` · ${row.childCount} child item${row.childCount === 1 ? "" : "s"}` : ""}
                              </span>
                            </div>

                            <div className="epic-roadmap-status">
                              <span
                                className="epic-roadmap-status-pill"
                                style={{
                                  color: row.stage?.color ?? "#526175",
                                  background: row.stage?.color
                                    ? `color-mix(in srgb, ${row.stage.color} 14%, white)`
                                    : "rgba(148, 163, 184, 0.14)",
                                }}
                              >
                                <StageIcon size={13} />
                                {row.stage?.label ?? "No stage"}
                              </span>
                            </div>

                            <div className="epic-roadmap-person">
                              <span
                                className="task-avatar"
                                aria-hidden="true"
                                style={{ background: avatarBg(row.assigneeName) }}
                              >
                                {initials(row.assigneeName, null)}
                              </span>
                              <div className="epic-roadmap-person-copy">
                                <strong>{row.assigneeName}</strong>
                                <span>{row.task.created_by_name ? `Assigned by ${row.task.created_by_name}` : "No assigner shown"}</span>
                              </div>
                            </div>

                            <div className="epic-roadmap-window">
                              <strong>{row.windowLabel}</strong>
                              <span>{row.cycleName ?? (row.task.due_date ? "Due-date driven window" : "Auto planned window")}</span>
                            </div>
                          </div>

                          <div className="epic-roadmap-track">
                            <div
                              className="epic-roadmap-grid"
                              style={{ gridTemplateColumns: `repeat(${epicRoadmap.months.length}, minmax(120px, 1fr))` }}
                              aria-hidden="true"
                            >
                              {epicRoadmap.months.map((month) => (
                                <span key={month.key} className="epic-roadmap-grid-cell" />
                              ))}
                            </div>
                            <div
                              className={`epic-roadmap-bar ${row.stage?.is_done ? "done" : ""}`}
                              style={{
                                left: `${row.left}%`,
                                width: `${row.width}%`,
                                background: row.barColor,
                              }}
                            >
                              <span>{row.cycleName ?? row.task.title}</span>
                              <span>{row.childCount} item{row.childCount === 1 ? "" : "s"}</span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>
          ) : viewMode === "list" ? (
            <TaskListView tasks={filteredBoardItems} stages={stageList} onOpen={(task) => setDrawer({ mode: "view", task })} />
          ) : (
            <div className="board-scroll">
              <div className="tasks-board-grid" style={{ gridTemplateColumns: `repeat(${stageList.length}, minmax(252px, 1fr))` }}>
                {stageList.map((stage) => {
                  const items = filteredBoardItems.filter((task) => task.status === stage.id);
                  const groups = groupItems(items);
                  const StageIcon = getTaskStageIcon(stage);
                  return (
                    <section
                      className={`kanban-column ${dragOverCol === stage.id ? "dragover" : ""} ${draggingStageId === stage.id ? "dragging-stage" : ""} ${isDraggingTask ? "drag-card-active" : ""}`}
                      key={stage.id}
                      aria-label={stage.label}
                      onDragOver={(event) => {
                        if (isDraggingTask && dragSourceStatus === stage.id) return;
                        if (isDraggingStage && draggingStageId === stage.id) return;
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "move";
                        setDragOverCol(stage.id);
                      }}
                      onDragLeave={(event) => {
                        if (event.currentTarget === event.target) setDragOverCol(null);
                      }}
                      onDrop={(event) => onDrop(stage.id, event)}
                    >
                      <div
                        className={`kanban-column-head ${canManageWorkflow ? "col-head-draggable" : ""}`}
                        draggable={canManageWorkflow}
                        onDragStart={(event) => {
                          if (!canManageWorkflow) return;
                          setDraggingStageId(stage.id);
                          setDraggingId(null);
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData(STAGE_MIME, stage.id);
                        }}
                        onDragEnd={() => {
                          setDraggingStageId(null);
                          setDragOverCol(null);
                        }}
                      >
                        <div className="kanban-column-title-wrap">
                          <StageIcon className="kanban-column-stage-icon" size={15} style={{ color: stage.color }} />
                          <span className="kanban-column-title">{stage.label}</span>
                        </div>
                        <span className="kanban-column-total">{items.length}</span>
                      </div>
                      <div className="kanban-column-body">
                        {items.length === 0 ? (
                          <div className="kanban-empty">Nothing here yet.</div>
                        ) : (
                          groups.map((group) => (
                            <div key={group.name || "all"} className="task-stack">
                              {groupBy !== "none" && (
                                <div className="task-group-head">
                                  <span>{group.name}</span>
                                  <span>{group.items.length}</span>
                                </div>
                              )}
                              {group.items.map((task) => <Card key={task.id} task={task} />)}
                            </div>
                          ))
                        )}
                        {isDraggingTask && dragSourceStatus !== stage.id && (
                          <div className={`drop-placeholder ${dragOverCol === stage.id ? "on" : ""}`}>
                            <span>{dragOverCol === stage.id ? "Drop work item here" : "Drag work item here"}</span>
                          </div>
                        )}
                        {isDraggingStage && !isDraggingTask && draggingStageId !== stage.id && (
                          <div className={`drop-placeholder stage ${dragOverCol === stage.id ? "on" : ""}`}>
                            <span>{dragOverCol === stage.id ? "Drop stage here" : "Move stage here"}</span>
                          </div>
                        )}
                      </div>
                    </section>
                  );
                })}
              </div>
            </div>
          )}
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
          cycles={cycleList}
          modules={moduleList}
          epics={epicOptions}
          stages={stageList}
          onClose={() => setDrawer(null)}
          lockedProjectId={activeProjectId}
          canManageTask={canManageWorkflow}
          canMoveTask={drawer.mode === "view" ? canMoveTask(drawer.task) : canCreateTasks}
        />
      )}

      {deleteDialog && (
        <div className="modal-overlay" onClick={closeDeleteStage} role="alertdialog" aria-modal="true" aria-label="Delete workflow stage" style={{ zIndex: 85 }}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <h3>Delete &quot;{deleteDialog.label}&quot;</h3>
            <p style={{ color: "var(--text-dim)", fontSize: 13, lineHeight: 1.7, marginBottom: 18 }}>
              {deleteDialog.taskCount > 0
                ? `There ${deleteDialog.taskCount === 1 ? "is" : "are"} ${deleteDialog.taskCount} work item${deleteDialog.taskCount === 1 ? "" : "s"} in this stage. Choose where they should move before you delete it.`
                : "This stage is empty. Once deleted, it disappears from this project's workflow immediately."}
            </p>

            {deleteDialog.taskCount > 0 && (
              <label className="field">
                <span className="label">Move remaining work items to</span>
                <select className="select" value={deleteMoveTo} onChange={(event) => setDeleteMoveTo(event.target.value)}>
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
                  onChange={(event) => setDeletePassword(event.target.value)}
                  placeholder="Enter your password"
                  autoFocus
                />
              </label>
            )}

            {deleteApproved && (
              <div role="status" style={{ fontSize: 12.5, color: "#10b981", background: "rgba(16, 185, 129, 0.08)", border: "1px solid rgba(16, 185, 129, 0.2)", borderRadius: 8, padding: "9px 11px", marginBottom: 14 }}>
                Password already confirmed for this browser session. You can delete more stages without re-entering it.
              </div>
            )}

            {deleteErr && <div className="form-err" role="alert">{deleteErr}</div>}

            <div className="modal-actions">
              <button className="btn-ghost" onClick={closeDeleteStage} disabled={deleteBusy}>Cancel</button>
              <button className="btn" onClick={removeStage} disabled={deleteBusy} style={{ background: "#ef4444", color: "#fff" }}>
                {deleteBusy ? "Deleting..." : "Delete stage"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
