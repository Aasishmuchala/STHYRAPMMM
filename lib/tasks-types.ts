export type TaskStatus = "todo" | "doing" | "review" | "done";
export type TaskPriority = "low" | "med" | "high";

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
export type ProjectOpt = { id: string; name: string; division_id: string };
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

export const STATUS_COLUMNS: { key: TaskStatus; label: string; dot: string }[] = [
  { key: "todo", label: "To do", dot: "var(--text-faint)" },
  { key: "doing", label: "Doing", dot: "var(--accent)" },
  { key: "review", label: "Review", dot: "var(--warning)" },
  { key: "done", label: "Done", dot: "var(--positive)" },
];
