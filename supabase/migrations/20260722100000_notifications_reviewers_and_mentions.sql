-- =============================================================================
-- 20260722100000_notifications_reviewers_and_mentions.sql
--
-- Idempotent. Adds:
--   * public.tasks.reviewer_id   - optional single-reviewer pointer
--   * public.notify_user(...)    - SECURITY DEFINER RPC so any signed-in user
--                                   can fan-out notifications to other users
--                                   (RLS on public.notifications previously
--                                   blocked inserts where user_id <> auth.uid())
--   * public.notify_users(...)   - bulk fan-out
-- =============================================================================

-- 1. reviewer_id column
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='tasks' and column_name='reviewer_id'
  ) then
    alter table public.tasks
      add column reviewer_id uuid references public.profiles(id) on delete set null;
  end if;
end $$;

create index if not exists tasks_reviewer_id_idx
  on public.tasks(reviewer_id)
  where reviewer_id is not null;

-- 2. notify_user(target uuid, kind text, title text, body text, link text)
--    Single-target variant. SECURITY DEFINER so the actor doesn't need to be
--    the recipient. Skips self-notifications.
create or replace function public.notify_user(
  target uuid,
  p_kind text,
  p_title text,
  p_body text,
  p_link text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if target is null then return; end if;
  if target = auth.uid() then return; end if;
  insert into public.notifications(user_id, kind, title, body, link)
    values (target, coalesce(nullif(p_kind, ''), 'task'), p_title, p_body, p_link);
exception when others then
  -- notifications are best-effort
  null;
end;
$$;

revoke all on function public.notify_user(uuid, text, text, text, text) from public;
grant execute on function public.notify_user(uuid, text, text, text, text) to authenticated;

-- 3. notify_users(targets uuid[], p_kind, p_title, p_body, p_link) - bulk variant
create or replace function public.notify_users(
  targets uuid[],
  p_kind text,
  p_title text,
  p_body text,
  p_link text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r uuid;
begin
  if targets is null or array_length(targets, 1) is null then return; end if;
  foreach r in array targets loop
    if r is null or r = auth.uid() then continue; end if;
    insert into public.notifications(user_id, kind, title, body, link)
      values (r, coalesce(nullif(p_kind, ''), 'task'), p_title, p_body, p_link);
  end loop;
exception when others then
  null;
end;
$$;

revoke all on function public.notify_users(uuid[], text, text, text, text) from public;
grant execute on function public.notify_users(uuid[], text, text, text, text) to authenticated;

-- 4. Sanity check: ensure notifications has the columns we depend on.
do $$
begin
  -- link column should exist (created in earlier migration). Add it defensively
  -- if for any reason the original migration didn't run.
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='notifications' and column_name='link'
  ) then
    alter table public.notifications add column link text;
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='notifications' and column_name='kind'
  ) then
    alter table public.notifications add column kind text not null default 'task';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='notifications' and column_name='body'
  ) then
    alter table public.notifications add column body text;
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='notifications' and column_name='read_at'
  ) then
    alter table public.notifications add column read_at timestamptz;
  end if;
end $$;