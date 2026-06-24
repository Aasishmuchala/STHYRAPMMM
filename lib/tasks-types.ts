export type TaskStatus = string;
export type TaskPriority = "low" | "med" | "high";

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
};

export type DivisionOpt = { id: string; slug: string; name: string };
export type ProjectOpt = { id: string; name: string; division_id: string; workflow_id?: string | null };
export type MemberOpt = { id: string; name: string };

export type TaskInput = {
  title: string;
  division_id: string;
  project_id: string | null;
  assignee_id: string | null;
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
