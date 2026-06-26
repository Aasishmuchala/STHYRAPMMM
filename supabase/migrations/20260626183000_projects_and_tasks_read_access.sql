alter table public.projects enable row level security;
alter table public.tasks enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'projects'
      and policyname = 'projects are visible to signed-in users'
  ) then
    create policy "projects are visible to signed-in users"
      on public.projects
      for select
      using (auth.role() = 'authenticated');
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'tasks'
      and policyname = 'tasks are visible to signed-in users'
  ) then
    create policy "tasks are visible to signed-in users"
      on public.tasks
      for select
      using (auth.role() = 'authenticated');
  end if;
end $$;
