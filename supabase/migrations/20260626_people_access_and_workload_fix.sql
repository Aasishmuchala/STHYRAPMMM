-- Let signed-in teammates read active profiles so People, Tasks assignee lists, and
-- other internal workspace surfaces can show the team instead of only the current user.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND policyname = 'active profiles are visible to signed-in users'
  ) THEN
    CREATE POLICY "active profiles are visible to signed-in users"
      ON public.profiles
      FOR SELECT
      TO authenticated
      USING (is_active = true);
  END IF;
END $$;

-- Fix open-task counting precedence so only non-done tasks are counted.
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
  FROM public.tasks t
  WHERE t.deleted_at IS NULL
    AND t.assignee_id IS NOT NULL
    AND (
      (t.workflow_stage_id IS NULL AND t.status_key NOT IN ('done'))
      OR EXISTS (
        SELECT 1
        FROM public.workflow_stages ws
        WHERE ws.id = t.workflow_stage_id
          AND ws.is_done = false
      )
    )
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
