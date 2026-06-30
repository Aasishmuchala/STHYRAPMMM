-- AI chat sessions + multi-turn memory, and a one-time backfill that rescues
-- tasks created with a NULL workflow_stage_id (e.g. early AI-created tasks) so
-- they render on Kanban boards instead of being silently orphaned.

-- 1. Sessions: one row per conversation thread.
create table if not exists public.ai_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default 'New chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_sessions_user_idx on public.ai_sessions(user_id, updated_at desc);

alter table public.ai_sessions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='ai_sessions'
      and policyname='users manage own ai_sessions'
  ) then
    create policy "users manage own ai_sessions"
      on public.ai_sessions for all
      using (user_id = auth.uid() or public.is_super_admin())
      with check (user_id = auth.uid() or public.is_super_admin());
  end if;
end $$;

-- 2. Link each run to its session (nullable -> backward compatible).
alter table public.ai_runs add column if not exists session_id uuid
  references public.ai_sessions(id) on delete set null;
create index if not exists ai_runs_session_id_idx on public.ai_runs(session_id);

-- 3. One-time backfill of orphan tasks. Runs with the user-trigger guard
--    disabled because restrict_assignee_task_updates() blocks bulk admin edits.
alter table public.tasks disable trigger user;

update public.tasks t
set workflow_stage_id = sub.stage_id,
    status_key = sub.stage_key
from (
  select tw.id as wf_id, ws.id as stage_id, ws.key as stage_key
  from public.task_workflows tw
  join lateral (
    select id, key from public.workflow_stages
    where workflow_id = tw.id order by position limit 1
  ) ws on true
) sub
where t.workflow_stage_id is null
  and t.deleted_at is null
  and sub.wf_id = coalesce(
    (select id from public.task_workflows where project_id = t.project_id),
    (select id from public.task_workflows where scope_key = 'general')
  );

alter table public.tasks enable trigger user;
