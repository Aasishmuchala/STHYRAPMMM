create table if not exists public.task_stages (
  key text primary key,
  label text not null,
  color text not null default 'var(--accent)',
  position integer not null default 0,
  is_done boolean not null default false,
  created_at timestamptz not null default now()
);

insert into public.task_stages (key, label, color, position, is_done)
values
  ('todo', 'To do', 'var(--text-faint)', 0, false),
  ('doing', 'Doing', 'var(--accent)', 1, false),
  ('review', 'Review', 'var(--warning)', 2, false),
  ('done', 'Done', 'var(--positive)', 3, true)
on conflict (key) do update
set
  label = excluded.label,
  color = excluded.color,
  position = excluded.position,
  is_done = excluded.is_done;

alter table public.tasks
  add column if not exists status_key text;

update public.tasks
set status_key = coalesce(status_key, status::text, 'todo')
where status_key is null;

alter table public.tasks
  alter column status_key set default 'todo';

alter table public.tasks
  alter column status_key set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tasks_status_key_fkey'
  ) then
    alter table public.tasks
      add constraint tasks_status_key_fkey
      foreign key (status_key)
      references public.task_stages(key)
      on update cascade
      on delete restrict;
  end if;
end $$;

create index if not exists tasks_status_key_idx on public.tasks(status_key);
create index if not exists task_stages_position_idx on public.task_stages(position);

alter table public.task_stages enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'task_stages'
      and policyname = 'task stages are visible to signed-in users'
  ) then
    create policy "task stages are visible to signed-in users"
      on public.task_stages
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
      and tablename = 'task_stages'
      and policyname = 'owners and leads manage task stages'
  ) then
    create policy "owners and leads manage task stages"
      on public.task_stages
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
