-- Adds a custom accent color column to profiles so each user can override the
-- theme's default accent. Hex string (#rrggbb); UI clamps invalid values to the theme accent.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS accent_color text NULL;

COMMENT ON COLUMN public.profiles.accent_color IS
  'Optional user-chosen accent override (#rrggbb). Falls back to theme accent when null.';

-- The home dashboard reads per-user stats: open tasks, completed tasks, projects led,
-- etc. We need the RLS already on profiles (id = auth.uid()) — no new policy.
-- Create a small helper view the People page can query without bloating client code.
CREATE OR REPLACE VIEW public.profile_workload_v1 AS
SELECT
  p.id            AS profile_id,
  p.full_name,
  p.email,
  p.global_role,
  p.is_active,
  p.created_at,
  COALESCE(open_tasks.count, 0)     AS open_tasks,
  COALESCE(done_tasks.count, 0)     AS done_tasks,
  COALESCE(overdue_tasks.count, 0)  AS overdue_tasks,
  COALESCE(active_cycles.count, 0)  AS active_cycles,
  COALESCE(projects_led.count, 0)   AS projects_led
FROM public.profiles p
LEFT JOIN (
  SELECT assignee_id AS user_id, COUNT(*)::int AS count
  FROM public.tasks
  WHERE deleted_at IS NULL AND assignee_id IS NOT NULL
    AND (status_key NOT IN ('done') AND workflow_stage_id IS NULL OR EXISTS (
      SELECT 1 FROM public.workflow_stages ws
      WHERE ws.id = tasks.workflow_stage_id AND ws.is_done = false
    ))
  GROUP BY assignee_id
) open_tasks ON open_tasks.user_id = p.id
LEFT JOIN (
  SELECT assignee_id AS user_id, COUNT(*)::int AS count
  FROM public.tasks t
  WHERE t.deleted_at IS NULL AND t.assignee_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.workflow_stages ws
      WHERE ws.id = t.workflow_stage_id AND ws.is_done = true
    )
  GROUP BY assignee_id
) done_tasks ON done_tasks.user_id = p.id
LEFT JOIN (
  SELECT assignee_id AS user_id, COUNT(*)::int AS count
  FROM public.tasks t
  WHERE t.deleted_at IS NULL AND t.assignee_id IS NOT NULL
    AND t.due_date IS NOT NULL AND t.due_date < CURRENT_DATE
    AND NOT EXISTS (
      SELECT 1 FROM public.workflow_stages ws
      WHERE ws.id = t.workflow_stage_id AND ws.is_done = true
    )
  GROUP BY assignee_id
) overdue_tasks ON overdue_tasks.user_id = p.id
LEFT JOIN (
  SELECT t.assignee_id AS user_id, COUNT(DISTINCT t.cycle_id)::int AS count
  FROM public.tasks t
  JOIN public.project_cycles c ON c.id = t.cycle_id AND c.status = 'active' AND c.deleted_at IS NULL
  WHERE t.deleted_at IS NULL AND t.assignee_id IS NOT NULL AND t.cycle_id IS NOT NULL
  GROUP BY t.assignee_id
) active_cycles ON active_cycles.user_id = p.id
LEFT JOIN (
  SELECT lead_id AS user_id, COUNT(*)::int AS count
  FROM public.projects
  WHERE lead_id IS NOT NULL AND status = 'active'
  GROUP BY lead_id
) projects_led ON projects_led.user_id = p.id;

GRANT SELECT ON public.profile_workload_v1 TO authenticated;

-- Daily per-user completion history for the People page sparkline (last 30 days).
-- One row per (user, day) with completed task count. Cheap, indexed by date.
CREATE TABLE IF NOT EXISTS public.profile_completion_daily (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  day date NOT NULL,
  count int NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

CREATE INDEX IF NOT EXISTS profile_completion_daily_user_day_idx
  ON public.profile_completion_daily (user_id, day DESC);

ALTER TABLE public.profile_completion_daily ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read all rows; the People page is internal anyway.
DROP POLICY IF EXISTS "read_all_completion_daily" ON public.profile_completion_daily;
CREATE POLICY "read_all_completion_daily"
  ON public.profile_completion_daily FOR SELECT
  TO authenticated USING (true);

-- Trigger: bump the daily counter when a task transitions to a done stage.
CREATE OR REPLACE FUNCTION public.bump_profile_completion_daily()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  is_done_stage boolean;
BEGIN
  -- Was the NEW row just completed? (workflow_stage points to a done stage)
  IF NEW.workflow_stage_id IS NOT NULL AND NEW.assignee_id IS NOT NULL THEN
    SELECT ws.is_done INTO is_done_stage
    FROM public.workflow_stages ws WHERE ws.id = NEW.workflow_stage_id;

    IF is_done_stage THEN
      INSERT INTO public.profile_completion_daily (user_id, day, count)
      VALUES (NEW.assignee_id, CURRENT_DATE, 1)
      ON CONFLICT (user_id, day) DO UPDATE SET count = public.profile_completion_daily.count + 1;
    END IF;
  END IF;

  -- If the task moved AWAY from a done stage (e.g. reopened), decrement today.
  IF (TG_OP = 'UPDATE')
     AND OLD.workflow_stage_id IS NOT NULL
     AND (NEW.workflow_stage_id IS DISTINCT FROM OLD.workflow_stage_id)
     AND OLD.assignee_id IS NOT NULL THEN
    SELECT ws.is_done INTO is_done_stage
    FROM public.workflow_stages ws WHERE ws.id = OLD.workflow_stage_id;

    IF is_done_stage THEN
      UPDATE public.profile_completion_daily
      SET count = GREATEST(count - 1, 0)
      WHERE user_id = OLD.assignee_id AND day = CURRENT_DATE;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tasks_bump_completion_daily ON public.tasks;
CREATE TRIGGER tasks_bump_completion_daily
  AFTER INSERT OR UPDATE OF workflow_stage_id, assignee_id ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.bump_profile_completion_daily();

-- Indexes that the People page and home dashboard hit on every load.
-- Composite (assignee_id, deleted_at) covers the open/done task counts.
-- (workflow_stage_id) covers the join used by profile_workload_v1's done filter.
CREATE INDEX IF NOT EXISTS tasks_assignee_deleted_idx
  ON public.tasks (assignee_id, deleted_at);

CREATE INDEX IF NOT EXISTS tasks_due_date_idx
  ON public.tasks (due_date)
  WHERE deleted_at IS NULL AND assignee_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS tasks_workflow_stage_idx
  ON public.tasks (workflow_stage_id)
  WHERE deleted_at IS NULL;