import type { IconType } from "react-icons";
import {
  FiCheckCircle,
  FiChevronDown,
  FiChevronUp,
  FiChevronsDown,
  FiChevronsUp,
  FiCircle,
  FiClock,
  FiMinus,
  FiPlay,
  FiTarget,
} from "react-icons/fi";
import { HiOutlineBugAnt } from "react-icons/hi2";
import { LuCircleDotDashed } from "react-icons/lu";
import { PiDiamondsFourDuotone, PiSparkleFill } from "react-icons/pi";
import { TbSubtask } from "react-icons/tb";
import type { BoardTask, TaskPriority, TaskStage, WorkItemType } from "@/lib/tasks-types";

export const ITEM_TYPE_META: Record<WorkItemType, { label: string; color: string; Icon: IconType }> = {
  epic: { label: "Epic", color: "#f97316", Icon: PiDiamondsFourDuotone },
  story: { label: "Story", color: "#2563eb", Icon: FiTarget },
  task: { label: "Task", color: "#0f172a", Icon: LuCircleDotDashed },
  bug: { label: "Bug", color: "#ef4444", Icon: HiOutlineBugAnt },
  improvement: { label: "Improvement", color: "#10b981", Icon: PiSparkleFill },
  subtask: { label: "Sub-task", color: "#8b5cf6", Icon: TbSubtask },
};

export const PRIORITY_ICON_META: Record<TaskPriority, { label: string; color: string; Icon: IconType }> = {
  highest: { label: "Highest", color: "#ef4444", Icon: FiChevronsUp },
  high: { label: "High", color: "#f59e0b", Icon: FiChevronUp },
  medium: { label: "Medium", color: "#f59e0b", Icon: FiMinus },
  low: { label: "Low", color: "#3b82f6", Icon: FiChevronDown },
  lowest: { label: "Lowest", color: "#64748b", Icon: FiChevronsDown },
};

export function getTaskDisplayKey(task: BoardTask) {
  const source = (task.project_name ?? task.division_name ?? "TASK")
    .replace(/[^a-zA-Z0-9 ]/g, " ")
    .trim();
  const prefix = source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.slice(0, 2).toUpperCase())
    .join("")
    .slice(0, 4) || "TK";
  const suffix = task.id.replace(/[^a-zA-Z0-9]/g, "").slice(-2).toUpperCase() || "01";
  return `${prefix}-${suffix}`;
}

export function getTaskContextLabel(task: BoardTask) {
  return task.module_name ?? task.cycle_name ?? task.division_name.replace(/^Sthyra\s+/, "");
}

export function getTaskStageIcon(stage: Pick<TaskStage, "key" | "label" | "is_done">): IconType {
  const value = `${stage.key} ${stage.label}`.toLowerCase();
  if (stage.is_done || value.includes("done") || value.includes("complete")) return FiCheckCircle;
  if (value.includes("review") || value.includes("approve") || value.includes("qa")) return FiClock;
  if (value.includes("doing") || value.includes("progress") || value.includes("active")) return FiPlay;
  return FiCircle;
}
