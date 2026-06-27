-- =============================================================================
-- 20260629_activity_log.sql
--
-- Owner-only audit trail: one generic activity_log table fed by a single
-- trigger attached to every business table. Captures who did what (create /
-- update / delete / soft-delete / restore) with a per-field diff.
--
-- Deliberately NOT attached to: profiles (theme/wallpaper/accent — appearance),
-- auth.users (password/email), profile_completion_daily, notifications,
-- access_log, ai_runs, ai_pending_actions, task_history, activity_log itself.
-- Those are noise or sensitive, exactly the "unnecessary" changes to skip.
--
-- Idempotent + additive. Never drops data.
-- =============================================================================

create table if not exists public.activity_log (
  id            bigserial primary key,
  actor_id      uuid,                       -- auth.uid() of whoever did it (no FK: must never block the business write)
  action        text not null,              -- created | updated | deleted | restored
  entity_type   text not null,              -- source table name, e.g. 'tasks'
  entity_id     text,                       -- row id as text (works for uuid + bigint keys)
  entity_label  text,                       -- human label (title/name/...) snapshot
  division_id   uuid,                       -- for division-scoped filtering, when present
  summary       text not null,              -- pre-rendered one-liner
  changes       jsonb,                      -- { field: { old, new } } for updates
  created_at    timestamptz not null default now()
);

create index if not exists activity_log_created_idx   on public.activity_log(created_at desc);
create index if not exists activity_log_actor_idx     on public.activity_log(actor_id, created_at desc);
create index if not exists activity_log_entity_idx     on public.activity_log(entity_type, created_at desc);
create index if not exists activity_log_division_idx   on public.activity_log(division_id, created_at desc);

alter table public.activity_log enable row level security;

-- Owner / super-admin reads only. There is intentionally NO insert policy:
-- rows are written exclusively by the SECURITY DEFINER trigger below, which
-- bypasses RLS as the table owner. Normal users can never read or write here.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='activity_log' and policyname='super admins read activity log'
  ) then
    create policy "super admins read activity log"
      on public.activity_log for select
      using (public.is_super_admin());
  end if;
end $$;

-- =============================================================================
-- Generic logging trigger
-- =============================================================================

create or replace function public.log_activity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  rec       jsonb;
  old_rec   jsonb;
  changes   jsonb := '{}'::jsonb;
  -- Columns that change on their own and carry no audit value.
  noise     text[] := array[
    'updated_at', 'created_at', 'search_tsv', 'tsv', 'fts', 'content_tsv',
    'embedding', 'last_used_at'
  ];
  k         text;
  v_old     text;
  v_new     text;
  label     text;
  div       uuid;
  ent_id    text;
  verb      text;
  actor     uuid := auth.uid();
  s_old     text;
  s_new     text;
  a_old     text;
  a_new     text;
begin
  if tg_op = 'DELETE' then
    rec := to_jsonb(old);
  else
    rec := to_jsonb(new);
  end if;

  ent_id := rec->>'id';
  label  := coalesce(
    rec->>'title', rec->>'name', rec->>'item', rec->>'label',
    rec->>'sequence', rec->>'full_name', rec->>'email'
  );

  begin
    div := nullif(rec->>'division_id', '')::uuid;
  exception when others then
    div := null;
  end;

  if tg_op = 'UPDATE' then
    old_rec := to_jsonb(old);

    -- soft-delete / restore detection takes priority over a plain "updated"
    if (old_rec->>'deleted_at') is null and (rec->>'deleted_at') is not null then
      verb := 'deleted';
    elsif (old_rec->>'deleted_at') is not null and (rec->>'deleted_at') is null then
      verb := 'restored';
    else
      verb := 'updated';
    end if;

    for k in select jsonb_object_keys(rec) loop
      if k = any(noise) then continue; end if;
      v_old := old_rec->>k;
      v_new := rec->>k;
      if v_old is distinct from v_new then
        changes := changes || jsonb_build_object(k, jsonb_build_object('old', v_old, 'new', v_new));
      end if;
    end loop;

    -- Nothing meaningful changed (e.g. only a touch_updated_at fired). Skip.
    if changes = '{}'::jsonb then
      return new;
    end if;

    -- Make task stage + assignee changes human-readable instead of raw uuids.
    if tg_table_name = 'tasks' then
      if changes ? 'workflow_stage_id' then
        select ws.label into s_old from public.workflow_stages ws where ws.id = nullif(old_rec->>'workflow_stage_id','')::uuid;
        select ws.label into s_new from public.workflow_stages ws where ws.id = nullif(rec->>'workflow_stage_id','')::uuid;
        changes := (changes - 'workflow_stage_id')
          || jsonb_build_object('stage', jsonb_build_object('old', s_old, 'new', s_new));
      end if;
      if changes ? 'assignee_id' then
        select p.full_name into a_old from public.profiles p where p.id = nullif(old_rec->>'assignee_id','')::uuid;
        select p.full_name into a_new from public.profiles p where p.id = nullif(rec->>'assignee_id','')::uuid;
        changes := (changes - 'assignee_id')
          || jsonb_build_object('assignee', jsonb_build_object('old', a_old, 'new', a_new));
      end if;
    end if;

  elsif tg_op = 'INSERT' then
    verb := 'created';
  else
    verb := 'deleted';
  end if;

  insert into public.activity_log(actor_id, action, entity_type, entity_id, entity_label, division_id, summary, changes)
  values (
    actor,
    verb,
    tg_table_name,
    ent_id,
    label,
    div,
    verb || ' ' || tg_table_name || coalesce(' "' || label || '"', ''),
    case when tg_op = 'UPDATE' then changes else null end
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.log_activity() from public;

-- =============================================================================
-- Attach the trigger to every business table that exists. Idempotent.
-- =============================================================================

do $$
declare
  t      text;
  tables text[] := array[
    'tasks', 'transactions', 'invoices', 'clients', 'documents',
    'ra_bills', 'bom_items', 'project_cycles', 'project_modules', 'projects',
    'division_members', 'recurring_payments', 'task_comments', 'task_links',
    'task_labels', 'project_releases', 'okrs', 'automation_rules', 'webhooks',
    'repo_links', 'share_links', 'divisions', 'invite_allowlist', 'api_keys'
  ];
begin
  foreach t in array tables loop
    if exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = t
    ) then
      execute format('drop trigger if exists %I on public.%I', 'activity_log_' || t, t);
      execute format(
        'create trigger %I after insert or update or delete on public.%I for each row execute function public.log_activity()',
        'activity_log_' || t, t
      );
    end if;
  end loop;
end $$;
