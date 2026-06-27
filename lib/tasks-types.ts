export type TaskStatus = string;
export type TaskPriority = "lowest" | "low" | "medium" | "high" | "highest";
export type WorkItemType = "epic" | "story" | "task" | "bug" | "improvement" | "subtask";
export type CycleStatus = "planned" | "active" | "completed";
export type ModuleStatus = "planned" | "active" | "archived";

export const TASK_PRIORITY_ORDER: TaskPriority[] = ["highest", "high", "medium", "low", "lowest"];

export const TASK_PRIORITY_META: Record<TaskPriority, { label: string; color: string; hint: string }> = {
  highest: { label: "Highest", color: "#f87171", hint: "Blocks progress right now." },
  high: { label: "High", color: "#fb923c", hint: "Serious issue that can block work." },
  medium: { label: "Medium", color: "#f59e0b", hint: "Needs attention soon." },
  low: { label: "Low", color: "#3b82f6", hint: "Important, but not urgent." },
  lowest: { label: "Lowest", color: "#60a5fa", hint: "Trivial or nice-to-have." },
};

export function isTaskPriority(value: string): value is TaskPriority {
  return value in TASK_PRIORITY_META;
}

export type TaskStage = {
  id: string;
  workflow_id: string;
  key: string;
  label: string;
  color: string;
  position: number;
  is_done: boolean;
};

export type BoardTask = {
  id: string;
  title: string;
  description: string | null;
  item_type: WorkItemType;
  priority: TaskPriority;
  status: TaskStatus;
  due_date: string | null;
  division_id: string;
  division_name: string;
  division_slug: string;
  project_id: string | null;
  project_name: string | null;
  assignee_id: string | null;
  assignee_name: string | null;
  created_by: string | null;
  created_by_name: string | null;
  cycle_id: string | null;
  cycle_name: string | null;
  module_id: string | null;
  module_name: string | null;
  parent_task_id: string | null;
  parent_task_title: string | null;
};

export type DivisionOpt = { id: string; slug: string; name: string };
export type ProjectOpt = { id: string; name: string; division_id: string; workflow_id?: string | null };
export type MemberOpt = { id: string; name: string };
export type CycleOpt = {
  id: string;
  project_id: string;
  name: string;
  goal: string | null;
  starts_on: string | null;
  ends_on: string | null;
  status: CycleStatus;
};
export type ModuleOpt = {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  color: string;
  status: ModuleStatus;
  lead_id: string | null;
  lead_name: string | null;
};

export type TaskInput = {
  title: string;
  division_id: string;
  project_id: string | null;
  assignee_id: string | null;
  cycle_id: string | null;
  module_id: string | null;
  parent_task_id: string | null;
  item_type: WorkItemType;
  priority: TaskPriority;
  status: TaskStatus;
  due_date: string | null;
  description: string | null;
};

export const DEFAULT_TASK_STAGES: TaskStage[] = [
  { id: "todo", workflow_id: "default", key: "todo", label: "To do", color: "var(--text-faint)", position: 0, is_done: false },
  { id: "doing", workflow_id: "default", key: "doing", label: "Doing", color: "var(--accent)", position: 1, is_done: false },
  { id: "review", workflow_id: "default", key: "review", label: "Review", color: "var(--warning)", position: 2, is_done: false },
  { id: "done", workflow_id: "default", key: "done", label: "Done", color: "var(--positive)", position: 3, is_done: true },
];
