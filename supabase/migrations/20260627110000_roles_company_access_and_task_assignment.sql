do $$
begin
  begin
    alter type public.global_role add value if not exists 'super_admin';
  exception when duplicate_object then null;
  end;

  begin
    alter type public.division_role add value if not exists 'owner';
  exception when duplicate_object then null;
  end;

  begin
    alter type public.division_role add value if not exists 'accountant';
  exception when duplicate_object then null;
  end;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'divisions'
      and column_name = 'slug'
      and udt_name = 'division_slug'
  ) then
    alter table public.divisions
      alter column slug type text
      using slug::text;
  end if;
end $$;

alter table public.divisions
  alter column slug set not null;

create unique index if not exists divisions_slug_unique_idx
  on public.divisions (slug);

create or replace function public.is_super_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.global_role::text in ('owner', 'super_admin')
  );
$$;

create or replace function public.has_division_role(div uuid, roles text[])
returns boolean
language sql
stable
as $$
  select
    public.is_super_admin()
    or exists (
      select 1
      from public.division_members dm
      where dm.user_id = auth.uid()
        and dm.division_id = div
        and dm.role::text = any(roles)
    );
$$;

create or replace function public.can_access_workspace_division(div uuid)
returns boolean
language sql
stable
as $$
  select public.has_division_role(div, array['owner', 'lead', 'member']);
$$;

create or replace function public.can_manage_division(div uuid)
returns boolean
language sql
stable
as $$
  select public.has_division_role(div, array['owner', 'lead']);
$$;

create or replace function public.can_access_project(proj uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = proj
      and public.can_access_workspace_division(p.division_id)
  );
$$;

create or replace function public.can_manage_project(proj uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = proj
      and public.can_manage_division(p.division_id)
  );
$$;

create or replace function public.restrict_assignee_task_updates()
returns trigger
language plpgsql
as $$
begin
  if public.is_super_admin() or public.can_manage_division(new.division_id) then
    return new;
  end if;

  if old.assignee_id = auth.uid()
    and new.assignee_id is not distinct from old.assignee_id
    and new.created_at is not distinct from old.created_at
    and new.created_by is not distinct from old.created_by
    and new.deleted_at is not distinct from old.deleted_at
    and new.description is not distinct from old.description
    and new.division_id is not distinct from old.division_id
    and new.doc_id is not distinct from old.doc_id
    and new.due_date is not distinct from old.due_date
    and new.id is not distinct from old.id
    and new.priority is not distinct from old.priority
    and new.project_id is not distinct from old.project_id
    and new.title is not distinct from old.title
    and new.transaction_id is not distinct from old.transaction_id
    and new.item_type is not distinct from old.item_type
    and new.cycle_id is not distinct from old.cycle_id
    and new.module_id is not distinct from old.module_id
    and new.parent_task_id is not distinct from old.parent_task_id
  then
    return new;
  end if;

  raise exception 'Only the task assignee can move this task, and only managers can edit the rest of it.';
end;
$$;

drop trigger if exists tasks_restrict_assignee_updates on public.tasks;
create trigger tasks_restrict_assignee_updates
  before update on public.tasks
  for each row
  execute function public.restrict_assignee_task_updates();

alter table public.divisions enable row level security;
alter table public.projects enable row level security;
alter table public.tasks enable row level security;
alter table public.task_workflows enable row level security;
alter table public.workflow_stages enable row level security;
alter table public.project_cycles enable row level security;
alter table public.project_modules enable row level security;

drop policy if exists "projects are visible to signed-in users" on public.projects;
drop policy if exists "tasks are visible to signed-in users" on public.tasks;
drop policy if exists "task workflows are visible to signed-in users" on public.task_workflows;
drop policy if exists "workflow stages are visible to signed-in users" on public.workflow_stages;
drop policy if exists "project cycles are visible to signed-in users" on public.project_cycles;
drop policy if exists "project modules are visible to signed-in users" on public.project_modules;
drop policy if exists "owners and leads manage task workflows" on public.task_workflows;
drop policy if exists "owners and leads manage workflow stages" on public.workflow_stages;
drop policy if exists "owners and leads manage project cycles" on public.project_cycles;
drop policy if exists "owners and leads manage project modules" on public.project_modules;

create policy "divisions visible to relevant members"
  on public.divisions
  for select
  using (
    public.is_super_admin()
    or exists (
      select 1
      from public.division_members dm
      where dm.user_id = auth.uid()
        and dm.division_id = divisions.id
    )
  );

create policy "super admins manage divisions"
  on public.divisions
  for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "workspace members see projects"
  on public.projects
  for select
  using (public.can_access_workspace_division(division_id));

create policy "managers manage projects"
  on public.projects
  for all
  using (public.can_manage_division(division_id))
  with check (public.can_manage_division(division_id));

create policy "workspace members see tasks"
  on public.tasks
  for select
  using (
    public.can_access_workspace_division(division_id)
    or assignee_id = auth.uid()
  );

create policy "workspace members create tasks"
  on public.tasks
  for insert
  with check (
    public.can_access_workspace_division(division_id)
    and created_by = auth.uid()
  );

create policy "assignees and managers update tasks"
  on public.tasks
  for update
  using (
    public.can_manage_division(division_id)
    or assignee_id = auth.uid()
  )
  with check (
    public.can_manage_division(division_id)
    or assignee_id = auth.uid()
  );

create policy "managers delete tasks"
  on public.tasks
  for delete
  using (public.can_manage_division(division_id));

create policy "workspace members see task workflows"
  on public.task_workflows
  for select
  using (
    project_id is null
    or public.can_access_project(project_id)
  );

create policy "project managers manage task workflows"
  on public.task_workflows
  for all
  using (
    project_id is not null
    and public.can_manage_project(project_id)
  )
  with check (
    project_id is not null
    and public.can_manage_project(project_id)
  );

create policy "workspace members see workflow stages"
  on public.workflow_stages
  for select
  using (
    exists (
      select 1
      from public.task_workflows tw
      where tw.id = workflow_stages.workflow_id
        and (tw.project_id is null or public.can_access_project(tw.project_id))
    )
  );

create policy "project managers manage workflow stages"
  on public.workflow_stages
  for all
  using (
    exists (
      select 1
      from public.task_workflows tw
      where tw.id = workflow_stages.workflow_id
        and tw.project_id is not null
        and public.can_manage_project(tw.project_id)
    )
  )
  with check (
    exists (
      select 1
      from public.task_workflows tw
      where tw.id = workflow_stages.workflow_id
        and tw.project_id is not null
        and public.can_manage_project(tw.project_id)
    )
  );

create policy "workspace members see project cycles"
  on public.project_cycles
  for select
  using (public.can_access_project(project_id));

create policy "project managers manage cycles"
  on public.project_cycles
  for all
  using (public.can_manage_project(project_id))
  with check (public.can_manage_project(project_id));

create policy "workspace members see project modules"
  on public.project_modules
  for select
  using (public.can_access_project(project_id));

create policy "project managers manage modules"
  on public.project_modules
  for all
  using (public.can_manage_project(project_id))
  with check (public.can_manage_project(project_id));
