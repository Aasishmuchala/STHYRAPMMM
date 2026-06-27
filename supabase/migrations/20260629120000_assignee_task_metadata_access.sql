-- =============================================================================
-- 20260629120000_assignee_task_metadata_access.sql
--
-- Members can already read tasks assigned to them via the tasks RLS policy, but
-- the related workflow/project metadata remained hidden unless they also had
-- workspace/project access. That left /tasks able to count assigned work items
-- while rendering empty columns because workflow stages could not be joined.
--
-- Fix: allow assignees to read the minimum task-adjacent metadata needed to
-- render their assigned tasks: projects, task workflows, workflow stages,
-- project cycles, and project modules.
-- =============================================================================

drop policy if exists "workspace members see projects" on public.projects;
create policy "workspace members see projects"
  on public.projects
  for select
  using (
    public.can_access_workspace_division(division_id)
    or exists (
      select 1
      from public.tasks t
      where t.project_id = projects.id
        and t.assignee_id = auth.uid()
        and t.deleted_at is null
    )
  );

drop policy if exists "workspace members see task workflows" on public.task_workflows;
create policy "workspace members see task workflows"
  on public.task_workflows
  for select
  using (
    project_id is null
    or public.can_access_project(project_id)
    or exists (
      select 1
      from public.tasks t
      where t.project_id = task_workflows.project_id
        and t.assignee_id = auth.uid()
        and t.deleted_at is null
    )
  );

drop policy if exists "workspace members see workflow stages" on public.workflow_stages;
create policy "workspace members see workflow stages"
  on public.workflow_stages
  for select
  using (
    exists (
      select 1
      from public.tasks t
      where t.workflow_stage_id = workflow_stages.id
        and t.assignee_id = auth.uid()
        and t.deleted_at is null
    )
    or exists (
      select 1
      from public.task_workflows tw
      where tw.id = workflow_stages.workflow_id
        and (tw.project_id is null or public.can_access_project(tw.project_id))
    )
  );

drop policy if exists "workspace members see project cycles" on public.project_cycles;
create policy "workspace members see project cycles"
  on public.project_cycles
  for select
  using (
    public.can_access_project(project_id)
    or exists (
      select 1
      from public.tasks t
      where t.project_id = project_cycles.project_id
        and t.cycle_id = project_cycles.id
        and t.assignee_id = auth.uid()
        and t.deleted_at is null
    )
  );

drop policy if exists "workspace members see project modules" on public.project_modules;
create policy "workspace members see project modules"
  on public.project_modules
  for select
  using (
    public.can_access_project(project_id)
    or exists (
      select 1
      from public.tasks t
      where t.project_id = project_modules.project_id
        and t.module_id = project_modules.id
        and t.assignee_id = auth.uid()
        and t.deleted_at is null
    )
  );
