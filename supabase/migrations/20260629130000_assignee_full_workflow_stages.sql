-- =============================================================================
-- 20260629130000_assignee_full_workflow_stages.sql
--
-- A member who is only an *assignee* on a project (not a division member) could
-- previously read only the single workflow stage their task currently sat in
-- (see 20260629120000). That made their board render just one column (e.g.
-- "To do") instead of the project's full workflow (To do / Doing / Review /
-- Done).
--
-- Fix: let an assignee read EVERY stage of any workflow they have an assigned
-- task in, so their board shows the same columns as the project board.
--
-- A self-referential policy on workflow_stages (a subquery over workflow_stages
-- inside its own policy) would recurse, so we resolve the set of "workflows I
-- have a task in" through a SECURITY DEFINER helper that bypasses RLS.
-- =============================================================================

create or replace function public.assigned_workflow_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select distinct s.workflow_id
  from public.tasks t
  join public.workflow_stages s on s.id = t.workflow_stage_id
  where t.assignee_id = auth.uid()
    and t.deleted_at is null;
$$;

revoke all on function public.assigned_workflow_ids() from public;
grant execute on function public.assigned_workflow_ids() to authenticated;

drop policy if exists "workspace members see workflow stages" on public.workflow_stages;
create policy "workspace members see workflow stages"
  on public.workflow_stages
  for select
  using (
    -- General workflow, or a project the user can access normally.
    exists (
      select 1
      from public.task_workflows tw
      where tw.id = workflow_stages.workflow_id
        and (tw.project_id is null or public.can_access_project(tw.project_id))
    )
    -- Or: every stage of a workflow the user has an assigned task in.
    or workflow_stages.workflow_id in (select public.assigned_workflow_ids())
  );
