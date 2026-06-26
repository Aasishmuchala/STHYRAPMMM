create extension if not exists pgcrypto;

create table if not exists public.project_cycles (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  goal text,
  starts_on date,
  ends_on date,
  status text not null default 'planned',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint project_cycles_status_check check (status in ('planned', 'active', 'completed')),
  constraint project_cycles_project_name_unique unique (project_id, name)
);

create table if not exists public.project_modules (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  description text,
  color text not null default '#3b82f6',
  status text not null default 'active',
  lead_id uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint project_modules_status_check check (status in ('planned', 'active', 'archived')),
  constraint project_modules_project_name_unique unique (project_id, name)
);

alter table public.tasks
  add column if not exists item_type text,
  add column if not exists cycle_id uuid,
  add column if not exists module_id uuid,
  add column if not exists parent_task_id uuid;

update public.tasks
set item_type = coalesce(item_type, 'task')
where item_type is null;

alter table public.tasks
  alter column item_type set default 'task';

alter table public.tasks
  alter column item_type set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tasks_item_type_check'
  ) then
    alter table public.tasks
      add constraint tasks_item_type_check
      check (item_type in ('epic', 'story', 'task', 'bug', 'improvement', 'subtask'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tasks_cycle_id_fkey'
  ) then
    alter table public.tasks
      add constraint tasks_cycle_id_fkey
      foreign key (cycle_id)
      references public.project_cycles(id)
      on update cascade
      on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'tasks_module_id_fkey'
  ) then
    alter table public.tasks
      add constraint tasks_module_id_fkey
      foreign key (module_id)
      references public.project_modules(id)
      on update cascade
      on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'tasks_parent_task_id_fkey'
  ) then
    alter table public.tasks
      add constraint tasks_parent_task_id_fkey
      foreign key (parent_task_id)
      references public.tasks(id)
      on update cascade
      on delete set null;
  end if;
end $$;

create index if not exists project_cycles_project_id_idx on public.project_cycles(project_id) where deleted_at is null;
create index if not exists project_modules_project_id_idx on public.project_modules(project_id) where deleted_at is null;
create index if not exists tasks_item_type_idx on public.tasks(item_type) where deleted_at is null;
create index if not exists tasks_cycle_id_idx on public.tasks(cycle_id) where deleted_at is null;
create index if not exists tasks_module_id_idx on public.tasks(module_id) where deleted_at is null;
create index if not exists tasks_parent_task_id_idx on public.tasks(parent_task_id) where deleted_at is null;

alter table public.project_cycles enable row level security;
alter table public.project_modules enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'project_cycles'
      and policyname = 'project cycles are visible to signed-in users'
  ) then
    create policy "project cycles are visible to signed-in users"
      on public.project_cycles
      for select
      using (auth.role() = 'authenticated');
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'project_modules'
      and policyname = 'project modules are visible to signed-in users'
  ) then
    create policy "project modules are visible to signed-in users"
      on public.project_modules
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
      and tablename = 'project_cycles'
      and policyname = 'owners and leads manage project cycles'
  ) then
    create policy "owners and leads manage project cycles"
      on public.project_cycles
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

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'project_modules'
      and policyname = 'owners and leads manage project modules'
  ) then
    create policy "owners and leads manage project modules"
      on public.project_modules
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
