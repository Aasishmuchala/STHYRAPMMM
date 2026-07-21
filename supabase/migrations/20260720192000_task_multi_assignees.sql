create table if not exists public.task_assignees (
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  assigned_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (task_id, user_id)
);

create index if not exists task_assignees_user_id_idx
  on public.task_assignees(user_id);

create index if not exists task_assignees_task_id_idx
  on public.task_assignees(task_id);

alter table public.task_assignees enable row level security;

insert into public.task_assignees(task_id, user_id, assigned_by)
select id, assignee_id, created_by
from public.tasks
where assignee_id is not null
on conflict (task_id, user_id) do nothing;

drop policy if exists "task assignees are visible with tasks" on public.task_assignees;
create policy "task assignees are visible with tasks"
on public.task_assignees
for select
using (
  exists (
    select 1
    from public.tasks t
    where t.id = task_assignees.task_id
      and t.deleted_at is null
      and (
        public.can_access_workspace_division(t.division_id)
        or t.assignee_id = auth.uid()
        or task_assignees.user_id = auth.uid()
      )
  )
);

drop policy if exists "task managers insert task assignees" on public.task_assignees;
create policy "task managers insert task assignees"
on public.task_assignees
for insert
with check (
  exists (
    select 1
    from public.tasks t
    where t.id = task_assignees.task_id
      and t.deleted_at is null
      and (
        public.can_manage_division(t.division_id)
        or t.created_by = auth.uid()
      )
  )
);

drop policy if exists "task managers delete task assignees" on public.task_assignees;
create policy "task managers delete task assignees"
on public.task_assignees
for delete
using (
  exists (
    select 1
    from public.tasks t
    where t.id = task_assignees.task_id
      and t.deleted_at is null
      and public.can_manage_division(t.division_id)
  )
);
