export type PersonMembership = {
  id: string;
  division_id: string;
  division_name: string;
  division_slug: string;
  role: string;
};

export type Person = {
  id: string;
  full_name: string | null;
  email: string | null;
  global_role: string;
  is_active: boolean;
  created_at: string | null;
  open_tasks: number;
  done_tasks: number;
  overdue_tasks: number;
  active_cycles: number;
  projects_led: number;
  memberships: PersonMembership[];
};

export type PersonDaily = {
  day: string; // YYYY-MM-DD
  count: number;
};

export type PersonTask = {
  id: string;
  title: string;
  priority: string | null;
  item_type: string | null;
  project_name: string | null;
  completed_at: string | null;
  due_date: string | null;
};

export type DivisionMeta = { id: string; slug: string; name: string };