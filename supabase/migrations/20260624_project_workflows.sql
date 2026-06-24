create extension if not exists pgcrypto;

create table if not exists public.task_workflows (
  id uuid primary key default gen_random_uuid(),
  project_id uuid unique references public.projects(id) on delete cascade,
  scope_key text unique,
  name text not null,
  created_at timestamptz not null default now(),
  constraint task_workflows_scope_or_project check (
    (project_id is not null and scope_key is null)
    or (project_id is null and scope_key is not null)
  )
);

create table if not exists public.workflow_stages (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.task_workflows(id) on delete cascade,
  key text not null,
  label text not null,
  color text not null default 'var(--accent)',
  position integer not null default 0,
  is_done boolean not null default false,
  created_at timestamptz not null default now(),
  constraint workflow_stages_workflow_key_unique unique (workflow_id, key),
  constraint workflow_stages_workflow_position_unique unique (workflow_id, position)
);

insert into public.task_workflows (scope_key, name)
values ('general', 'General workflow')
on conflict (scope_key) do update
set name = excluded.name;

insert into public.task_workflows (project_id, name)
select p.id, p.name || ' workflow'
from public.projects p
where p.deleted_at is null
on conflict (project_id) do update
set name = excluded.name;

insert into public.workflow_stages (workflow_id, key, label, color, position, is_done)
select w.id, s.key, s.label, s.color, s.position, s.is_done
from public.task_workflows w
cross join public.task_stages s
where not exists (
  select 1
  from public.workflow_stages ws
  where ws.workflow_id = w.id
)
on conflict (workflow_id, key) do update
set
  label = excluded.label,
  color = excluded.color,
  position = excluded.position,
  is_done = excluded.is_done;

alter table public.tasks
  add column if not exists workflow_stage_id uuid;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'tasks_status_key_fkey'
  ) then
    alter table public.tasks
      drop constraint tasks_status_key_fkey;
  end if;
end $$;

update public.tasks t
set workflow_stage_id = coalesce(
  (
    select ws.id
    from public.workflow_stages ws
    where ws.workflow_id = coalesce(
      (select tw.id from public.task_workflows tw where tw.project_id = t.project_id limit 1),
      (select tw.id from public.task_workflows tw where tw.scope_key = 'general' limit 1)
    )
      and ws.key = coalesce(t.status_key, t.status::text, 'todo')
    order by ws.position
    limit 1
  ),
  (
    select ws.id
    from public.workflow_stages ws
    where ws.workflow_id = coalesce(
      (select tw.id from public.task_workflows tw where tw.project_id = t.project_id limit 1),
      (select tw.id from public.task_workflows tw where tw.scope_key = 'general' limit 1)
    )
    order by ws.position
    limit 1
  )
)
where t.workflow_stage_id is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tasks_workflow_stage_id_fkey'
  ) then
    alter table public.tasks
      add constraint tasks_workflow_stage_id_fkey
      foreign key (workflow_stage_id)
      references public.workflow_stages(id)
      on update cascade
      on delete restrict;
  end if;
end $$;

create index if not exists tasks_workflow_stage_id_idx on public.tasks(workflow_stage_id);
create index if not exists task_workflows_project_id_idx on public.task_workflows(project_id);
create index if not exists workflow_stages_workflow_position_idx on public.workflow_stages(workflow_id, position);

alter table public.task_workflows enable row level security;
alter table public.workflow_stages enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'task_workflows'
      and policyname = 'task workflows are visible to signed-in users'
  ) then
    create policy "task workflows are visible to signed-in users"
      on public.task_workflows
      for select
      using (auth.role() = 'authenticated');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'workflow_stages'
      and policyname = 'workflow stages are visible to signed-in users'
  ) then
    create policy "workflow stages are visible to signed-in users"
      on public.workflow_stages
      for select
      using (auth.role() = 'authenticated');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'task_workflows'
      and policyname = 'owners and leads manage task workflows'
  ) then
    create policy "owners and leads manage task workflows"
      on public.task_workflows
      for all
      using (
        exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.global_role = 'owner'
        )
        or exists (
          select 1
          from public.division_members dm
          where dm.user_id = auth.uid()
            and dm.role = 'lead'
        )
      )
      with check (
        exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.global_role = 'owner'
        )
        or exists (
          select 1
          from public.division_members dm
          where dm.user_id = auth.uid()
            and dm.role = 'lead'
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'workflow_stages'
      and policyname = 'owners and leads manage workflow stages'
  ) then
    create policy "owners and leads manage workflow stages"
      on public.workflow_stages
      for all
      using (
        exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.global_role = 'owner'
        )
        or exists (
          select 1
          from public.division_members dm
          where dm.user_id = auth.uid()
            and dm.role = 'lead'
        )
      )
      with check (
        exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.global_role = 'owner'
        )
        or exists (
          select 1
          from public.division_members dm
          where dm.user_id = auth.uid()
            and dm.role = 'lead'
        )
      );
  end if;
end $$;
