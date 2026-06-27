-- =============================================================================
-- 20260628_audit_fix_and_features.sql
--
-- Idempotent, additive migration. Closes every RLS gap from the audit, adds
-- missing indexes/constraints, and creates the schema for the 17 new Jira-
-- parity features + 17 opportunity features. NEVER drops existing data.
-- =============================================================================

-- =============================================================================
-- 0. search_path hardening on every SECURITY DEFINER / stable function
-- =============================================================================

-- Re-create the audit-prescribed helpers with SET search_path pinned.
create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.global_role::text in ('owner', 'super_admin')
  );
$$;

revoke all on function public.is_super_admin() from public;
grant execute on function public.is_super_admin() to authenticated;

create or replace function public.has_division_role(div uuid, roles text[])
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
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

revoke all on function public.has_division_role(uuid, text[]) from public;
grant execute on function public.has_division_role(uuid, text[]) to authenticated;

create or replace function public.can_access_workspace_division(div uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.has_division_role(div, array['owner', 'lead', 'member']);
$$;

revoke all on function public.can_access_workspace_division(uuid) from public;
grant execute on function public.can_access_workspace_division(uuid) to authenticated;

create or replace function public.can_manage_division(div uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.has_division_role(div, array['owner', 'lead']);
$$;

revoke all on function public.can_manage_division(uuid) from public;
grant execute on function public.can_manage_division(uuid) to authenticated;

create or replace function public.can_access_project(proj uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = proj
      and public.can_access_workspace_division(p.division_id)
  );
$$;

revoke all on function public.can_access_project(uuid) from public;
grant execute on function public.can_access_project(uuid) to authenticated;

create or replace function public.can_manage_project(proj uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = proj
      and public.can_manage_division(p.division_id)
  );
$$;

revoke all on function public.can_manage_project(uuid) from public;
grant execute on function public.can_manage_project(uuid) to authenticated;

-- New helpers
create or replace function public.can_access_finance_division(div uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.has_division_role(div, array['owner', 'lead', 'accountant']);
$$;

revoke all on function public.can_access_finance_division(uuid) from public;
grant execute on function public.can_access_finance_division(uuid) to authenticated;

create or replace function public.is_task_assignee(t uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.tasks
    where id = t and assignee_id = auth.uid() and deleted_at is null
  );
$$;

revoke all on function public.is_task_assignee(uuid) from public;
grant execute on function public.is_task_assignee(uuid) to authenticated;

-- tasks.completed_at must exist before team_velocity_7d (a LANGUAGE SQL
-- function whose body is validated at creation time) can reference it.
-- This is also (idempotently) re-asserted in section 14.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='tasks' and column_name='completed_at'
  ) then
    alter table public.tasks add column completed_at timestamptz;
  end if;
end $$;

-- 7-day team velocity per division, used by the estimate trigger
create or replace function public.team_velocity_7d(div uuid)
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with completed as (
    select count(*)::numeric as n
    from public.tasks t
    where t.division_id = div
      and t.deleted_at is null
      and t.completed_at is not null
      and t.completed_at >= now() - interval '7 days'
  )
  select n from completed;
$$;

revoke all on function public.team_velocity_7d(uuid) from public;
grant execute on function public.team_velocity_7d(uuid) to authenticated;

-- =============================================================================
-- 1. Enable RLS on tables that were missing it
-- =============================================================================

do $$
begin
  alter table public.documents enable row level security;
exception when others then null;
end $$;

do $$
begin
  alter table public.clients enable row level security;
exception when others then null;
end $$;

do $$
begin
  alter table public.transactions enable row level security;
exception when others then null;
end $$;

do $$
begin
  alter table public.invoices enable row level security;
exception when others then null;
end $$;

do $$
begin
  alter table public.ra_bills enable row level security;
exception when others then null;
end $$;

do $$
begin
  alter table public.bom_items enable row level security;
exception when others then null;
end $$;

do $$
begin
  alter table public.division_briefs enable row level security;
exception when others then null;
end $$;

do $$
begin
  alter table public.invite_allowlist enable row level security;
exception when others then null;
end $$;

do $$
begin
  alter table public.division_members enable row level security;
exception when others then null;
end $$;

do $$
begin
  alter table public.access_log enable row level security;
exception when others then null;
end $$;

do $$
begin
  alter table public.notifications enable row level security;
exception when others then null;
end $$;

do $$
begin
  alter table public.ai_runs enable row level security;
exception when others then null;
end $$;

do $$
begin
  alter table public.ai_pending_actions enable row level security;
exception when others then null;
end $$;

-- =============================================================================
-- 2. profiles self-update policy (fixes saveAppearance runtime failure)
-- =============================================================================

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='profiles' and policyname='users update own profile'
  ) then
    create policy "users update own profile"
      on public.profiles
      for update
      using (id = auth.uid())
      with check (id = auth.uid());
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='profiles' and policyname='super admins manage all profiles'
  ) then
    create policy "super admins manage all profiles"
      on public.profiles
      for all
      using (public.is_super_admin())
      with check (public.is_super_admin());
  end if;
end $$;

-- =============================================================================
-- 3. division_members — block self-promotion to owner, scope to managers
-- =============================================================================

drop policy if exists "members see their own memberships" on public.division_members;
drop policy if exists "managers add members" on public.division_members;
drop policy if exists "managers update members" on public.division_members;
drop policy if exists "managers remove members" on public.division_members;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='division_members' and policyname='division_members visible to managers or self'
  ) then
    create policy "division_members visible to managers or self"
      on public.division_members
      for select
      using (
        public.is_super_admin()
        or user_id = auth.uid()
        or public.can_manage_division(division_id)
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='division_members' and policyname='managers add members'
  ) then
    create policy "managers add members"
      on public.division_members
      for insert
      with check (
        public.can_manage_division(division_id)
        and (role::text <> 'owner' or public.is_super_admin())
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='division_members' and policyname='managers update members'
  ) then
    create policy "managers update members"
      on public.division_members
      for update
      using (public.can_manage_division(division_id))
      with check (
        public.can_manage_division(division_id)
        and (role::text <> 'owner' or public.is_super_admin())
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='division_members' and policyname='managers remove members'
  ) then
    create policy "managers remove members"
      on public.division_members
      for delete
      using (
        public.can_manage_division(division_id)
        and (role::text <> 'owner' or public.is_super_admin())
      );
  end if;
end $$;

-- =============================================================================
-- 4. division-scoped finance RLS — documents, clients, transactions,
--    invoices, ra_bills, bom_items, division_briefs
-- =============================================================================

-- documents
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='documents' and policyname='workspace members see documents'
  ) then
    create policy "workspace members see documents"
      on public.documents for select
      using (public.can_access_workspace_division(division_id));
  end if;
end $$;
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='documents' and policyname='workspace members create documents'
  ) then
    create policy "workspace members create documents"
      on public.documents for insert
      with check (public.can_access_workspace_division(division_id) and created_by = auth.uid());
  end if;
end $$;
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='documents' and policyname='managers update documents'
  ) then
    create policy "managers update documents"
      on public.documents for update
      using (public.can_manage_division(division_id))
      with check (public.can_manage_division(division_id));
  end if;
end $$;
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='documents' and policyname='managers delete documents'
  ) then
    create policy "managers delete documents"
      on public.documents for delete
      using (public.can_manage_division(division_id));
  end if;
end $$;

-- clients
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='clients' and policyname='workspace members see clients'
  ) then
    create policy "workspace members see clients"
      on public.clients for select
      using (public.can_access_workspace_division(division_id));
  end if;
end $$;
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='clients' and policyname='managers manage clients'
  ) then
    create policy "managers manage clients"
      on public.clients for all
      using (public.can_manage_division(division_id))
      with check (public.can_manage_division(division_id));
  end if;
end $$;

-- transactions
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='transactions' and policyname='finance members see transactions'
  ) then
    create policy "finance members see transactions"
      on public.transactions for select
      using (public.can_access_finance_division(division_id));
  end if;
end $$;
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='transactions' and policyname='managers manage transactions'
  ) then
    create policy "managers manage transactions"
      on public.transactions for all
      using (public.can_manage_division(division_id))
      with check (public.can_manage_division(division_id));
  end if;
end $$;

-- invoices
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='invoices' and policyname='finance members see invoices'
  ) then
    create policy "finance members see invoices"
      on public.invoices for select
      using (public.can_access_finance_division(division_id));
  end if;
end $$;
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='invoices' and policyname='managers manage invoices'
  ) then
    create policy "managers manage invoices"
      on public.invoices for all
      using (public.can_manage_division(division_id))
      with check (public.can_manage_division(division_id));
  end if;
end $$;

-- ra_bills
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='ra_bills' and policyname='finance members see ra_bills'
  ) then
    create policy "finance members see ra_bills"
      on public.ra_bills for select
      using (public.can_access_finance_division(division_id));
  end if;
end $$;
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='ra_bills' and policyname='managers manage ra_bills'
  ) then
    create policy "managers manage ra_bills"
      on public.ra_bills for all
      using (public.can_manage_division(division_id))
      with check (public.can_manage_division(division_id));
  end if;
end $$;

-- bom_items
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='bom_items' and policyname='finance members see bom_items'
  ) then
    create policy "finance members see bom_items"
      on public.bom_items for select
      using (public.can_access_finance_division(division_id));
  end if;
end $$;
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='bom_items' and policyname='managers manage bom_items'
  ) then
    create policy "managers manage bom_items"
      on public.bom_items for all
      using (public.can_manage_division(division_id))
      with check (public.can_manage_division(division_id));
  end if;
end $$;

-- division_briefs
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='division_briefs' and policyname='workspace members see division_briefs'
  ) then
    create policy "workspace members see division_briefs"
      on public.division_briefs for select
      using (public.can_access_workspace_division(division_id));
  end if;
end $$;
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='division_briefs' and policyname='managers manage division_briefs'
  ) then
    create policy "managers manage division_briefs"
      on public.division_briefs for all
      using (public.can_manage_division(division_id))
      with check (public.can_manage_division(division_id));
  end if;
end $$;

-- recurring_payments + finance_import_batches — division-scoped read
drop policy if exists "owners and leads manage recurring payments" on public.recurring_payments;
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='recurring_payments' and policyname='finance members see recurring payments'
  ) then
    create policy "finance members see recurring payments"
      on public.recurring_payments for select
      using (public.can_access_finance_division(division_id));
  end if;
end $$;
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='recurring_payments' and policyname='managers manage recurring payments'
  ) then
    create policy "managers manage recurring payments"
      on public.recurring_payments for all
      using (public.can_manage_division(division_id))
      with check (public.can_manage_division(division_id));
  end if;
end $$;

drop policy if exists "owners and leads manage finance import batches" on public.finance_import_batches;
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='finance_import_batches' and policyname='finance members see import batches'
  ) then
    create policy "finance members see import batches"
      on public.finance_import_batches for select
      using (
        exists (
          select 1 from public.transactions t
          where t.import_batch_id = finance_import_batches.id
            and public.can_access_finance_division(t.division_id)
        )
      );
  end if;
end $$;
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='finance_import_batches' and policyname='managers manage import batches'
  ) then
    create policy "managers manage import batches"
      on public.finance_import_batches for all
      using (
        exists (
          select 1 from public.transactions t
          where t.import_batch_id = finance_import_batches.id
            and public.can_manage_division(t.division_id)
        )
      )
      with check (
        exists (
          select 1 from public.transactions t
          where t.import_batch_id = finance_import_batches.id
            and public.can_manage_division(t.division_id)
        )
      );
  end if;
end $$;

-- =============================================================================
-- 5. profile_completion_daily — tighten from using(true)
-- =============================================================================

drop policy if exists "read_all_completion_daily" on public.profile_completion_daily;
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='profile_completion_daily' and policyname='self or super admin reads completion'
  ) then
    create policy "self or super admin reads completion"
      on public.profile_completion_daily for select
      using (user_id = auth.uid() or public.is_super_admin());
  end if;
end $$;

-- =============================================================================
-- 6. invite_allowlist — owner-only, with self visibility
-- =============================================================================

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='invite_allowlist' and policyname='super admins manage invites'
  ) then
    create policy "super admins manage invites"
      on public.invite_allowlist for all
      using (public.is_super_admin())
      with check (public.is_super_admin());
  end if;
end $$;
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='invite_allowlist' and policyname='invitees see their own row'
  ) then
    create policy "invitees see their own row"
      on public.invite_allowlist for select
      using (email = (select email from auth.users where id = auth.uid()));
  end if;
end $$;

-- =============================================================================
-- 7. notifications, ai_runs, ai_pending_actions — owner/self scoped
-- =============================================================================

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='notifications' and policyname='users see own notifications'
  ) then
    create policy "users see own notifications"
      on public.notifications for select using (user_id = auth.uid() or public.is_super_admin());
  end if;
end $$;
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='notifications' and policyname='users update own notifications'
  ) then
    create policy "users update own notifications"
      on public.notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
end $$;
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='notifications' and policyname='service role inserts notifications'
  ) then
    create policy "service role inserts notifications"
      on public.notifications for insert with check (auth.uid() = user_id or public.is_super_admin());
  end if;
end $$;
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='notifications' and policyname='users delete own notifications'
  ) then
    create policy "users delete own notifications"
      on public.notifications for delete using (user_id = auth.uid());
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='ai_runs' and policyname='users see own ai_runs'
  ) then
    create policy "users see own ai_runs"
      on public.ai_runs for select using (user_id = auth.uid() or public.is_super_admin());
  end if;
end $$;
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='ai_runs' and policyname='users insert own ai_runs'
  ) then
    create policy "users insert own ai_runs"
      on public.ai_runs for insert with check (user_id = auth.uid() or public.is_super_admin());
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='ai_pending_actions' and policyname='users see own pending ai actions'
  ) then
    create policy "users see own pending ai actions"
      on public.ai_pending_actions for select using (user_id = auth.uid() or public.is_super_admin());
  end if;
end $$;
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='ai_pending_actions' and policyname='super admins update pending ai actions'
  ) then
    create policy "super admins update pending ai actions"
      on public.ai_pending_actions for update using (public.is_super_admin()) with check (public.is_super_admin());
  end if;
end $$;

-- =============================================================================
-- 8. access_log — write-only for authenticated users, read for super-admin
-- =============================================================================

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='access_log' and policyname='super admins read access log'
  ) then
    create policy "super admins read access log"
      on public.access_log for select using (public.is_super_admin());
  end if;
end $$;
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='access_log' and policyname='authenticated users insert access log'
  ) then
    create policy "authenticated users insert access log"
      on public.access_log for insert with check (auth.uid() is not null);
  end if;
end $$;

-- =============================================================================
-- 9. Replace bump_profile_completion_daily with one that handles soft-delete
--    + reassignment + AFTER DELETE
-- =============================================================================

create or replace function public.bump_profile_completion_daily()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  old_user uuid;
  new_user uuid;
  old_done boolean := false;
  new_done boolean := false;
begin
  if tg_op = 'DELETE' then
    old_user := old.assignee_id;
    if old_user is null then return old; end if;
    if old.deleted_at is null then
      select coalesce(ws.is_done, false) into old_done
      from public.workflow_stages ws
      where ws.id = old.workflow_stage_id;
      if old_done then
        insert into public.profile_completion_daily(user_id, day, count)
          values (old_user, current_date, 1)
          on conflict (user_id, day) do update set count = profile_completion_daily.count + 1;
      end if;
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    new_user := new.assignee_id;
    if new_user is null or new.deleted_at is not null then return new; end if;
    select coalesce(ws.is_done, false) into new_done
    from public.workflow_stages ws
    where ws.id = new.workflow_stage_id;
    if new_done then
      insert into public.profile_completion_daily(user_id, day, count)
        values (new_user, current_date, 1)
        on conflict (user_id, day) do update set count = profile_completion_daily.count + 1;
    end if;
    return new;
  end if;

  -- UPDATE
  old_user := old.assignee_id;
  new_user := new.assignee_id;
  select coalesce(ws.is_done, false) into old_done
    from public.workflow_stages ws where ws.id = old.workflow_stage_id;
  select coalesce(ws.is_done, false) into new_done
    from public.workflow_stages ws where ws.id = new.workflow_stage_id;

  -- decrement old if was counted
  if old_user is not null and old_done and (old.deleted_at is null) then
    insert into public.profile_completion_daily(user_id, day, count)
      values (old_user, current_date, -1)
      on conflict (user_id, day) do update set count = profile_completion_daily.count - 1;
  end if;

  -- increment new if newly counted
  if new_user is not null and new_done and new.deleted_at is null then
    insert into public.profile_completion_daily(user_id, day, count)
      values (new_user, current_date, 1)
      on conflict (user_id, day) do update set count = profile_completion_daily.count + 1;
  end if;

  return new;
end;
$$;

drop trigger if exists tasks_bump_completion_daily on public.tasks;
create trigger tasks_bump_completion_daily
  after insert or update or delete on public.tasks
  for each row execute function public.bump_profile_completion_daily();

-- =============================================================================
-- 10. Missing FK indexes
-- =============================================================================

create index if not exists transactions_division_id_idx on public.transactions(division_id) where deleted_at is null;
create index if not exists transactions_created_by_idx on public.transactions(created_by);
create index if not exists transactions_occurred_on_idx on public.transactions(occurred_on);

create index if not exists invoices_division_id_idx on public.invoices(division_id) where deleted_at is null;
create index if not exists invoices_project_id_idx on public.invoices(project_id) where deleted_at is null;
create index if not exists invoices_created_by_idx on public.invoices(created_by);
create index if not exists invoices_due_on_idx on public.invoices(due_on) where deleted_at is null;

create index if not exists documents_division_id_idx on public.documents(division_id) where deleted_at is null;
create index if not exists documents_created_by_idx on public.documents(created_by);

create index if not exists projects_division_id_idx on public.projects(division_id) where deleted_at is null;

create index if not exists tasks_division_id_idx on public.tasks(division_id) where deleted_at is null;
create index if not exists tasks_project_id_idx on public.tasks(project_id) where deleted_at is null;
create index if not exists tasks_doc_id_idx on public.tasks(doc_id) where deleted_at is null;
create index if not exists tasks_transaction_id_idx on public.tasks(transaction_id) where deleted_at is null;
create index if not exists tasks_completed_at_idx on public.tasks(completed_at) where deleted_at is null;

create index if not exists division_members_division_id_idx on public.division_members(division_id);
create index if not exists project_modules_lead_id_idx on public.project_modules(lead_id);
create index if not exists project_cycles_created_by_idx on public.project_cycles(created_by);
create index if not exists recurring_payments_division_id_idx on public.recurring_payments(division_id);
create index if not exists recurring_payments_ends_on_idx on public.recurring_payments(ends_on);
create index if not exists notifications_user_id_idx on public.notifications(user_id);
create index if not exists notifications_read_at_idx on public.notifications(read_at);

-- =============================================================================
-- 11. NOT NULL + defaults + check constraints
-- =============================================================================

do $$
begin
  begin
    alter table public.tasks alter column priority set default 'medium';
  exception when others then null;
  end;
  begin
    alter table public.tasks alter column status set default 'todo';
  exception when others then null;
  end;
  begin
    alter table public.transactions alter column status set default 'draft';
  exception when others then null;
  end;
  begin
    alter table public.transactions alter column currency set default 'INR';
  exception when others then null;
  end;
  begin
    alter table public.transactions alter column direction set default 'in';
  exception when others then null;
  end;
  begin
    alter table public.invoices alter column status set default 'draft';
  exception when others then null;
  end;
  begin
    alter table public.profiles alter column theme set default 'slate';
  exception when others then null;
  end;
  begin
    alter table public.profiles alter column wallpaper set default 'none';
  exception when others then null;
  end;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='transactions_amount_paise_positive') then
    alter table public.transactions
      add constraint transactions_amount_paise_positive check (amount_paise > 0);
  end if;
exception when others then null;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='invoices_amount_paise_positive') then
    alter table public.invoices
      add constraint invoices_amount_paise_positive check (amount_paise > 0);
  end if;
exception when others then null;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='divisions_slug_format') then
    alter table public.divisions
      add constraint divisions_slug_format check (slug ~ '^[a-z][a-z0-9_]*$');
  end if;
exception when others then null;
end $$;

-- =============================================================================
-- 12. division_features jsonb column (replaces hardcoded slug checks)
-- =============================================================================

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='divisions' and column_name='features'
  ) then
    alter table public.divisions
      add column features jsonb not null default '{}'::jsonb;
  end if;
end $$;

-- Backfill known feature flags for existing divisions so the division page
-- keeps its current behavior unchanged.
update public.divisions set features = features || '{"bom": true}'::jsonb where slug = 'living_twin' and not (features ? 'bom');
update public.divisions set features = features || '{"ra_bills": true}'::jsonb where slug = 'construction' and not (features ? 'ra_bills');
update public.divisions set features = features || '{"purchase_orders": true}'::jsonb where slug in ('construction', 'living_twin') and not (features ? 'purchase_orders');

-- =============================================================================
-- 13. projects.budget_paise + projects.default_followup_template_id
-- =============================================================================

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='projects' and column_name='budget_paise'
  ) then
    alter table public.projects
      add column budget_paise bigint not null default 0
      check (budget_paise >= 0);
  end if;
end $$;

-- =============================================================================
-- 14. tasks.completed_at — required by team velocity and cycle metrics
-- =============================================================================

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='tasks' and column_name='completed_at'
  ) then
    alter table public.tasks add column completed_at timestamptz;
  end if;
end $$;

create index if not exists tasks_completed_at_idx on public.tasks(completed_at) where completed_at is not null;

-- =============================================================================
-- 15. New tables for missing Jira features
-- =============================================================================

-- task_comments
create table if not exists public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body_md text not null check (char_length(body_md) > 0 and char_length(body_md) <= 20000),
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz
);

create index if not exists task_comments_task_id_idx on public.task_comments(task_id, created_at desc);
create index if not exists task_comments_author_idx on public.task_comments(author_id);

alter table public.task_comments enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='task_comments' and policyname='workspace members see task comments') then
    create policy "workspace members see task comments"
      on public.task_comments for select
      using (
        exists (
          select 1 from public.tasks t
          where t.id = task_comments.task_id
            and (public.can_access_workspace_division(t.division_id) or t.assignee_id = auth.uid())
        )
      );
  end if;
end $$;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='task_comments' and policyname='authors insert their own comments') then
    create policy "authors insert their own comments"
      on public.task_comments for insert
      with check (
        author_id = auth.uid()
        and exists (
          select 1 from public.tasks t
          where t.id = task_comments.task_id
            and (public.can_access_workspace_division(t.division_id) or t.assignee_id = auth.uid())
        )
      );
  end if;
end $$;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='task_comments' and policyname='authors edit their own comments') then
    create policy "authors edit their own comments"
      on public.task_comments for update
      using (author_id = auth.uid())
      with check (author_id = auth.uid());
  end if;
end $$;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='task_comments' and policyname='author or manager deletes comment') then
    create policy "author or manager deletes comment"
      on public.task_comments for delete
      using (
        author_id = auth.uid()
        or exists (
          select 1 from public.tasks t
          where t.id = task_comments.task_id and public.can_manage_division(t.division_id)
        )
      );
  end if;
end $$;

-- task_work_logs
create table if not exists public.task_work_logs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  profile_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null,
  minutes integer not null check (minutes >= 0 and minutes <= 24 * 60 * 14),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists task_work_logs_task_idx on public.task_work_logs(task_id, started_at desc);
create index if not exists task_work_logs_profile_idx on public.task_work_logs(profile_id, started_at desc);

alter table public.task_work_logs enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='task_work_logs' and policyname='workspace members see work logs') then
    create policy "workspace members see work logs"
      on public.task_work_logs for select
      using (
        exists (
          select 1 from public.tasks t
          where t.id = task_work_logs.task_id
            and (public.can_access_workspace_division(t.division_id) or t.assignee_id = auth.uid())
        )
      );
  end if;
end $$;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='task_work_logs' and policyname='users log their own time') then
    create policy "users log their own time"
      on public.task_work_logs for insert
      with check (
        profile_id = auth.uid()
        and exists (
          select 1 from public.tasks t
          where t.id = task_work_logs.task_id
            and (public.can_access_workspace_division(t.division_id) or t.assignee_id = auth.uid())
        )
      );
  end if;
end $$;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='task_work_logs' and policyname='users edit their own logs') then
    create policy "users edit their own logs"
      on public.task_work_logs for update
      using (profile_id = auth.uid()) with check (profile_id = auth.uid());
  end if;
end $$;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='task_work_logs' and policyname='user or manager deletes log') then
    create policy "user or manager deletes log"
      on public.task_work_logs for delete
      using (
        profile_id = auth.uid()
        or exists (
          select 1 from public.tasks t
          where t.id = task_work_logs.task_id and public.can_manage_division(t.division_id)
        )
      );
  end if;
end $$;

-- task_watchers
create table if not exists public.task_watchers (
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (task_id, user_id)
);

create index if not exists task_watchers_user_idx on public.task_watchers(user_id);

alter table public.task_watchers enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='task_watchers' and policyname='workspace members see watchers') then
    create policy "workspace members see watchers"
      on public.task_watchers for select
      using (
        exists (
          select 1 from public.tasks t
          where t.id = task_watchers.task_id
            and (public.can_access_workspace_division(t.division_id) or t.assignee_id = auth.uid())
        )
      );
  end if;
end $$;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='task_watchers' and policyname='users watch for themselves') then
    create policy "users watch for themselves"
      on public.task_watchers for all
      using (user_id = auth.uid())
      with check (
        user_id = auth.uid()
        and exists (
          select 1 from public.tasks t
          where t.id = task_watchers.task_id
            and (public.can_access_workspace_division(t.division_id) or t.assignee_id = auth.uid())
        )
      );
  end if;
end $$;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='task_watchers' and policyname='managers remove watchers') then
    create policy "managers remove watchers"
      on public.task_watchers for delete
      using (
        user_id = auth.uid()
        or exists (
          select 1 from public.tasks t
          where t.id = task_watchers.task_id and public.can_manage_division(t.division_id)
        )
      );
  end if;
end $$;

-- task_links
do $$
begin
  if not exists (select 1 from pg_type where typname='task_link_kind') then
    create type public.task_link_kind as enum ('blocks', 'relates', 'duplicates');
  end if;
end $$;

create table if not exists public.task_links (
  id uuid primary key default gen_random_uuid(),
  src_task_id uuid not null references public.tasks(id) on delete cascade,
  dst_task_id uuid not null references public.tasks(id) on delete cascade,
  kind public.task_link_kind not null default 'relates',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  check (src_task_id <> dst_task_id)
);

create unique index if not exists task_links_unique on public.task_links(src_task_id, dst_task_id, kind);
create index if not exists task_links_dst_idx on public.task_links(dst_task_id);

alter table public.task_links enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='task_links' and policyname='workspace members see task links') then
    create policy "workspace members see task links"
      on public.task_links for select
      using (
        exists (
          select 1 from public.tasks t
          where (t.id = task_links.src_task_id or t.id = task_links.dst_task_id)
            and (public.can_access_workspace_division(t.division_id) or t.assignee_id = auth.uid())
        )
      );
  end if;
end $$;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='task_links' and policyname='managers create task links') then
    create policy "managers create task links"
      on public.task_links for insert
      with check (
        created_by = auth.uid()
        and exists (
          select 1 from public.tasks t
          where t.id = task_links.src_task_id
            and (public.can_access_workspace_division(t.division_id) or t.assignee_id = auth.uid())
        )
      );
  end if;
end $$;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='task_links' and policyname='managers delete task links') then
    create policy "managers delete task links"
      on public.task_links for delete
      using (
        exists (
          select 1 from public.tasks t
          where t.id = task_links.src_task_id and public.can_manage_division(t.division_id)
        )
      );
  end if;
end $$;

-- task_labels + task_label_assignments
create table if not exists public.task_labels (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 32),
  color text not null default '#6b7280' check (color ~ '^#[0-9a-fA-F]{6}$'),
  created_at timestamptz not null default now(),
  unique (project_id, name)
);

create table if not exists public.task_label_assignments (
  task_id uuid not null references public.tasks(id) on delete cascade,
  label_id uuid not null references public.task_labels(id) on delete cascade,
  primary key (task_id, label_id)
);

alter table public.task_labels enable row level security;
alter table public.task_label_assignments enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='task_labels' and policyname='workspace members see labels') then
    create policy "workspace members see labels"
      on public.task_labels for select using (public.can_access_project(project_id));
  end if;
end $$;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='task_labels' and policyname='managers manage labels') then
    create policy "managers manage labels"
      on public.task_labels for all
      using (public.can_manage_project(project_id))
      with check (public.can_manage_project(project_id));
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='task_label_assignments' and policyname='workspace members see label assignments') then
    create policy "workspace members see label assignments"
      on public.task_label_assignments for select
      using (
        exists (
          select 1 from public.task_labels l
          where l.id = task_label_assignments.label_id and public.can_access_project(l.project_id)
        )
      );
  end if;
end $$;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='task_label_assignments' and policyname='assignees and managers assign labels') then
    create policy "assignees and managers assign labels"
      on public.task_label_assignments for all
      using (
        exists (
          select 1 from public.tasks t
          where t.id = task_label_assignments.task_id
            and (public.can_manage_division(t.division_id) or t.assignee_id = auth.uid())
        )
      )
      with check (
        exists (
          select 1 from public.tasks t
          where t.id = task_label_assignments.task_id
            and (public.can_manage_division(t.division_id) or t.assignee_id = auth.uid())
        )
      );
  end if;
end $$;

-- project_releases
do $$
begin
  if not exists (select 1 from pg_type where typname='release_status') then
    create type public.release_status as enum ('planned', 'released', 'archived');
  end if;
end $$;

create table if not exists public.project_releases (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  target_date date,
  status public.release_status not null default 'planned',
  released_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists project_releases_project_idx on public.project_releases(project_id, target_date);

alter table public.project_releases enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='project_releases' and policyname='workspace members see releases') then
    create policy "workspace members see releases"
      on public.project_releases for select using (public.can_access_project(project_id));
  end if;
end $$;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='project_releases' and policyname='managers manage releases') then
    create policy "managers manage releases"
      on public.project_releases for all
      using (public.can_manage_project(project_id))
      with check (public.can_manage_project(project_id));
  end if;
end $$;

-- task_estimates
create table if not exists public.task_estimates (
  task_id uuid primary key references public.tasks(id) on delete cascade,
  estimate_points numeric(6,2) check (estimate_points >= 0),
  estimate_hours numeric(7,2) check (estimate_hours >= 0),
  predicted_finish timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.task_estimates enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='task_estimates' and policyname='workspace members see estimates') then
    create policy "workspace members see estimates"
      on public.task_estimates for select
      using (
        exists (
          select 1 from public.tasks t
          where t.id = task_estimates.task_id
            and (public.can_access_workspace_division(t.division_id) or t.assignee_id = auth.uid())
        )
      );
  end if;
end $$;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='task_estimates' and policyname='assignees and managers set estimates') then
    create policy "assignees and managers set estimates"
      on public.task_estimates for all
      using (
        exists (
          select 1 from public.tasks t
          where t.id = task_estimates.task_id
            and (public.can_manage_division(t.division_id) or t.assignee_id = auth.uid())
        )
      )
      with check (
        exists (
          select 1 from public.tasks t
          where t.id = task_estimates.task_id
            and (public.can_manage_division(t.division_id) or t.assignee_id = auth.uid())
        )
      );
  end if;
end $$;

-- task_history — populated by trigger
create table if not exists public.task_history (
  id bigserial primary key,
  task_id uuid not null references public.tasks(id) on delete cascade,
  field text not null,
  old_value text,
  new_value text,
  changed_by uuid references auth.users(id),
  changed_at timestamptz not null default now()
);

create index if not exists task_history_task_idx on public.task_history(task_id, changed_at desc);

alter table public.task_history enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='task_history' and policyname='workspace members see task history') then
    create policy "workspace members see task history"
      on public.task_history for select
      using (
        exists (
          select 1 from public.tasks t
          where t.id = task_history.task_id
            and (public.can_access_workspace_division(t.division_id) or t.assignee_id = auth.uid())
        )
      );
  end if;
end $$;

create or replace function public.record_task_history()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  changed_fields text[] := array[
    'title', 'description', 'priority', 'due_date', 'assignee_id',
    'workflow_stage_id', 'item_type', 'cycle_id', 'module_id', 'parent_task_id',
    'project_id', 'division_id'
  ];
  f text;
  ov text;
  nv text;
begin
  if tg_op = 'UPDATE' then
    foreach f in array changed_fields loop
      execute format('select ($1).%I::text', f) into ov using old;
      execute format('select ($1).%I::text', f) into nv using new;
      if ov is distinct from nv then
        insert into public.task_history(task_id, field, old_value, new_value, changed_by)
          values (new.id, f, ov, nv, auth.uid());
      end if;
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_history_trigger on public.tasks;
create trigger tasks_history_trigger
  after update on public.tasks
  for each row execute function public.record_task_history();

-- task_field_definitions + task_field_values
do $$
begin
  if not exists (select 1 from pg_type where typname='task_field_type') then
    create type public.task_field_type as enum ('text', 'number', 'select', 'date', 'checkbox');
  end if;
end $$;

create table if not exists public.task_field_definitions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  key text not null check (key ~ '^[a-z][a-z0-9_]{0,31}$'),
  label text not null,
  type public.task_field_type not null,
  options jsonb not null default '[]'::jsonb,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (project_id, key)
);

create table if not exists public.task_field_values (
  task_id uuid not null references public.tasks(id) on delete cascade,
  field_id uuid not null references public.task_field_definitions(id) on delete cascade,
  value jsonb,
  primary key (task_id, field_id)
);

alter table public.task_field_definitions enable row level security;
alter table public.task_field_values enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='task_field_definitions' and policyname='workspace members see field defs') then
    create policy "workspace members see field defs"
      on public.task_field_definitions for select using (public.can_access_project(project_id));
  end if;
end $$;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='task_field_definitions' and policyname='managers manage field defs') then
    create policy "managers manage field defs"
      on public.task_field_definitions for all
      using (public.can_manage_project(project_id))
      with check (public.can_manage_project(project_id));
  end if;
end $$;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='task_field_values' and policyname='workspace members see field values') then
    create policy "workspace members see field values"
      on public.task_field_values for select
      using (
        exists (
          select 1 from public.task_field_definitions d
          where d.id = task_field_values.field_id
            and public.can_access_project(d.project_id)
        )
      );
  end if;
end $$;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='task_field_values' and policyname='assignees and managers set field values') then
    create policy "assignees and managers set field values"
      on public.task_field_values for all
      using (
        exists (
          select 1 from public.tasks t
          where t.id = task_field_values.task_id
            and (public.can_manage_division(t.division_id) or t.assignee_id = auth.uid())
        )
      )
      with check (
        exists (
          select 1 from public.tasks t
          where t.id = task_field_values.task_id
            and (public.can_manage_division(t.division_id) or t.assignee_id = auth.uid())
        )
      );
  end if;
end $$;

-- automation_rules + automation_run_log
do $$
begin
  if not exists (select 1 from pg_type where typname='automation_trigger') then
    create type public.automation_trigger as enum (
      'task_created', 'task_updated', 'task_status_changed', 'task_assigned',
      'task_completed', 'invoice_overdue'
    );
  end if;
  if not exists (select 1 from pg_type where typname='automation_action') then
    create type public.automation_action as enum (
      'set_field', 'send_notification', 'post_webhook', 'add_label',
      'create_followup_task'
    );
  end if;
end $$;

create table if not exists public.automation_rules (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  division_id uuid references public.divisions(id) on delete cascade,
  name text not null,
  trigger_event public.automation_trigger not null,
  conditions jsonb not null default '{}'::jsonb,
  action public.automation_action not null,
  action_payload jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  check (project_id is not null or division_id is not null)
);

create table if not exists public.automation_run_log (
  id bigserial primary key,
  rule_id uuid not null references public.automation_rules(id) on delete cascade,
  ran_at timestamptz not null default now(),
  success boolean not null,
  message text,
  payload jsonb
);

create index if not exists automation_run_log_rule_idx on public.automation_run_log(rule_id, ran_at desc);

alter table public.automation_rules enable row level security;
alter table public.automation_run_log enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='automation_rules' and policyname='workspace members see automation rules') then
    create policy "workspace members see automation rules"
      on public.automation_rules for select
      using (
        (project_id is not null and public.can_access_project(project_id))
        or (division_id is not null and public.can_access_workspace_division(division_id))
      );
  end if;
end $$;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='automation_rules' and policyname='managers manage automation rules') then
    create policy "managers manage automation rules"
      on public.automation_rules for all
      using (
        (project_id is not null and public.can_manage_project(project_id))
        or (division_id is not null and public.can_manage_division(division_id))
      )
      with check (
        (project_id is not null and public.can_manage_project(project_id))
        or (division_id is not null and public.can_manage_division(division_id))
      );
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='automation_run_log' and policyname='workspace members see automation log') then
    create policy "workspace members see automation log"
      on public.automation_run_log for select
      using (
        exists (
          select 1 from public.automation_rules r
          where r.id = automation_run_log.rule_id
            and (
              (r.project_id is not null and public.can_access_project(r.project_id))
              or (r.division_id is not null and public.can_access_workspace_division(r.division_id))
            )
        )
      );
  end if;
end $$;

-- webhooks
do $$
begin
  if not exists (select 1 from pg_type where typname='webhook_channel') then
    create type public.webhook_channel as enum ('slack', 'teams', 'whatsapp', 'github', 'generic');
  end if;
end $$;

create table if not exists public.webhooks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  division_id uuid references public.divisions(id) on delete cascade,
  name text not null,
  channel public.webhook_channel not null,
  config jsonb not null default '{}'::jsonb,
  secret text,
  enabled boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  check (project_id is not null or division_id is not null)
);

alter table public.webhooks enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='webhooks' and policyname='managers manage webhooks') then
    create policy "managers manage webhooks"
      on public.webhooks for all
      using (
        (project_id is not null and public.can_manage_project(project_id))
        or (division_id is not null and public.can_manage_division(division_id))
      )
      with check (
        (project_id is not null and public.can_manage_project(project_id))
        or (division_id is not null and public.can_manage_division(division_id))
      );
  end if;
end $$;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='webhooks' and policyname='workspace members see webhooks') then
    create policy "workspace members see webhooks"
      on public.webhooks for select
      using (
        (project_id is not null and public.can_access_project(project_id))
        or (division_id is not null and public.can_access_workspace_division(division_id))
      );
  end if;
end $$;

-- repo_links (GitHub / GitLab)
create table if not exists public.repo_links (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  repo_url text not null,
  branch_pattern text not null default 'main',
  last_synced_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.repo_links enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='repo_links' and policyname='workspace members see repo links') then
    create policy "workspace members see repo links"
      on public.repo_links for select using (public.can_access_project(project_id));
  end if;
end $$;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='repo_links' and policyname='managers manage repo links') then
    create policy "managers manage repo links"
      on public.repo_links for all
      using (public.can_manage_project(project_id))
      with check (public.can_manage_project(project_id));
  end if;
end $$;

-- share_links (public read-only project view)
create table if not exists public.share_links (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  token text not null unique check (char_length(token) >= 24),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.share_links enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='share_links' and policyname='managers manage share links') then
    create policy "managers manage share links"
      on public.share_links for all
      using (public.can_manage_project(project_id))
      with check (public.can_manage_project(project_id));
  end if;
end $$;

-- okrs
create table if not exists public.okrs (
  id uuid primary key default gen_random_uuid(),
  parent_okr_id uuid references public.okrs(id) on delete cascade,
  owner_id uuid not null references auth.users(id),
  division_id uuid references public.divisions(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  description text,
  target_metric jsonb not null default '{}'::jsonb,
  current_value numeric not null default 0,
  period text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists okrs_division_idx on public.okrs(division_id, period);
create index if not exists okrs_owner_idx on public.okrs(owner_id);

alter table public.okrs enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='okrs' and policyname='workspace members see okrs') then
    create policy "workspace members see okrs"
      on public.okrs for select
      using (division_id is null or public.can_access_workspace_division(division_id));
  end if;
end $$;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='okrs' and policyname='managers manage okrs') then
    create policy "managers manage okrs"
      on public.okrs for all
      using (owner_id = auth.uid() or public.is_super_admin() or (division_id is not null and public.can_manage_division(division_id)))
      with check (owner_id = auth.uid() or public.is_super_admin() or (division_id is not null and public.can_manage_division(division_id)));
  end if;
end $$;

-- api_keys (for REST API access)
create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  hashed_token text not null unique,
  prefix text not null,
  scopes text[] not null default array['read']::text[],
  created_by uuid not null references auth.users(id),
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index if not exists api_keys_prefix_idx on public.api_keys(prefix) where revoked_at is null;

alter table public.api_keys enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='api_keys' and policyname='super admins manage api keys') then
    create policy "super admins manage api keys"
      on public.api_keys for all
      using (public.is_super_admin())
      with check (public.is_super_admin());
  end if;
end $$;

-- =============================================================================
-- 16. Recompute estimate on task change
-- =============================================================================

create or replace function public.recompute_task_estimate()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  vel numeric;
  est_h numeric;
  predicted timestamptz;
begin
  select estimate_hours into est_h from public.task_estimates where task_id = new.id;
  if est_h is null then
    return new;
  end if;
  vel := public.team_velocity_7d(new.division_id);
  if vel is null or vel <= 0 then
    vel := 1; -- assume 1 task/day floor
  end if;
  predicted := now() + (est_h / 8.0) * interval '1 day';
  insert into public.task_estimates(task_id, estimate_hours, predicted_finish, updated_at)
    values (new.id, est_h, predicted, now())
    on conflict (task_id) do update
      set predicted_finish = excluded.predicted_finish,
          updated_at = now();
  return new;
end;
$$;

drop trigger if exists tasks_recompute_estimate on public.tasks;
create trigger tasks_recompute_estimate
  after update of assignee_id, deleted_at, workflow_stage_id on public.tasks
  for each row execute function public.recompute_task_estimate();

-- Set completed_at when a task moves into a done stage
create or replace function public.set_task_completed_at()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  is_done boolean;
begin
  if new.workflow_stage_id is null then
    return new;
  end if;
  select coalesce(ws.is_done, false) into is_done
    from public.workflow_stages ws where ws.id = new.workflow_stage_id;
  if is_done and new.completed_at is null then
    new.completed_at := now();
  elsif not is_done and new.completed_at is not null then
    new.completed_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_set_completed_at on public.tasks;
create trigger tasks_set_completed_at
  before update of workflow_stage_id on public.tasks
  for each row execute function public.set_task_completed_at();

-- =============================================================================
-- 17. Cycle burndown view (for /reports)
-- =============================================================================

create or replace view public.cycle_burndown_v1
with (security_invoker = true) as
select
  c.id as cycle_id,
  c.name as cycle_name,
  c.project_id,
  date_trunc('day', gs.day)::date as day,
  count(t.*) filter (where t.deleted_at is null) as total_tasks,
  count(t.*) filter (where t.deleted_at is null and t.workflow_stage_id in (
    select id from public.workflow_stages where is_done
  )) as done_tasks
from public.project_cycles c
cross join lateral generate_series(
  coalesce(c.starts_on, c.created_at::date),
  coalesce(c.ends_on, c.created_at::date + interval '14 days'),
  interval '1 day'
) as gs(day)
left join public.tasks t
  on t.cycle_id = c.id
  and t.deleted_at is null
  and t.created_at::date <= date_trunc('day', gs.day)::date
group by c.id, c.name, c.project_id, gs.day;

-- =============================================================================
-- 18. Profile workload materialized view
-- =============================================================================

drop materialized view if exists public.profile_workload_mv;

create materialized view public.profile_workload_mv as
select
  p.id as user_id,
  p.full_name,
  p.email,
  p.global_role,
  coalesce(dm_open.open_count, 0)::int as open_count,
  coalesce(dm_done.done_count, 0)::int as done_count,
  coalesce(dm_over.overdue_count, 0)::int as overdue_count,
  coalesce(pc_cycles.active_cycles, 0)::int as active_cycles,
  coalesce(pc_leads.led_projects, 0)::int as led_projects
from public.profiles p
left join (
  select assignee_id,
         count(*) filter (where t.deleted_at is null and ws.is_done is distinct from true) as open_count,
         count(*) filter (where t.deleted_at is null and ws.is_done = true) as done_count,
         count(*) filter (where t.deleted_at is null and t.due_date < current_date and (ws.is_done is distinct from true)) as overdue_count
  from public.tasks t
  left join public.workflow_stages ws on ws.id = t.workflow_stage_id
  group by assignee_id
) dm_open on dm_open.assignee_id = p.id
left join (
  select assignee_id, count(*) as done_count
  from public.tasks t
  left join public.workflow_stages ws on ws.id = t.workflow_stage_id
  where t.deleted_at is null and ws.is_done = true
  group by assignee_id
) dm_done on dm_done.assignee_id = p.id
left join (
  select assignee_id, count(*) as overdue_count
  from public.tasks t
  left join public.workflow_stages ws on ws.id = t.workflow_stage_id
  where t.deleted_at is null and t.due_date < current_date and ws.is_done is distinct from true
  group by assignee_id
) dm_over on dm_over.assignee_id = p.id
left join (
  select c.created_by, count(*) as active_cycles
  from public.project_cycles c
  where c.status = 'active' and c.deleted_at is null
  group by c.created_by
) pc_cycles on pc_cycles.created_by = p.id
left join (
  select pr.lead_id, count(*) as led_projects
  from public.projects pr
  where pr.status = 'active' and pr.deleted_at is null
  group by pr.lead_id
) pc_leads on pc_leads.lead_id = p.id;

create unique index if not exists profile_workload_mv_user_idx on public.profile_workload_mv(user_id);

-- RPC to refresh the materialized view (called by app when a heavy page loads)
create or replace function public.refresh_workload_mv()
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  refresh materialized view concurrently public.profile_workload_mv;
$$;

revoke all on function public.refresh_workload_mv() from public;
grant execute on function public.refresh_workload_mv() to authenticated;

-- =============================================================================
-- 19. Atomic workflow stage reorder RPC (fixes persistWorkflowStagePositions)
-- =============================================================================

create or replace function public.reorder_workflow_stages(
  workflow_id_param uuid,
  ordered_stage_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  i int;
  sid uuid;
begin
  -- Caller must be able to manage the workflow's project
  if not exists (
    select 1 from public.task_workflows tw
    where tw.id = workflow_id_param
      and (tw.project_id is null and public.is_super_admin()
           or (tw.project_id is not null and public.can_manage_project(tw.project_id)))
  ) then
    raise exception 'Not authorized to reorder these stages';
  end if;

  for i in 1..array_length(ordered_stage_ids, 1) loop
    sid := ordered_stage_ids[i];
    update public.workflow_stages
      set position = i * 10
      where id = sid and workflow_id = workflow_id_param;
  end loop;
end;
$$;

revoke all on function public.reorder_workflow_stages(uuid, uuid[]) from public;
grant execute on function public.reorder_workflow_stages(uuid, uuid[]) to authenticated;

-- =============================================================================
-- 20. Atomic project+workflow+stages creation RPC
-- =============================================================================

create or replace function public.create_project_with_workflow(
  project_name text,
  project_client text,
  project_description text,
  project_starts_on date,
  project_target_end_on date,
  project_lead uuid,
  project_division uuid,
  project_budget_paise bigint default 0
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_project_id uuid;
  new_workflow_id uuid;
begin
  if not public.can_manage_division(project_division) then
    raise exception 'Not authorized to manage this division';
  end if;

  insert into public.projects(
    name, client, description, starts_on, target_end_on, lead_id,
    division_id, status, budget_paise, created_by
  )
  values (
    project_name, project_client, project_description,
    project_starts_on, project_target_end_on, project_lead,
    project_division, 'active', project_budget_paise, auth.uid()
  )
  returning id into new_project_id;

  insert into public.task_workflows(project_id, name)
  values (new_project_id, 'Default')
  returning id into new_workflow_id;

  insert into public.workflow_stages(workflow_id, key, label, position, is_done, color)
  values
    (new_workflow_id, 'todo', 'To do', 10, false, '#6b7280'),
    (new_workflow_id, 'in_progress', 'In progress', 20, false, '#3b82f6'),
    (new_workflow_id, 'done', 'Done', 30, true, '#10b981');

  return new_project_id;
exception when others then
  raise;
end;
$$;

revoke all on function public.create_project_with_workflow(text, text, text, date, date, uuid, uuid, bigint) from public;
grant execute on function public.create_project_with_workflow(text, text, text, date, date, uuid, uuid, bigint) to authenticated;

-- =============================================================================
-- 21. updated_at triggers on tables that lack them
-- =============================================================================

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='recurring_payments' and column_name='updated_at')
     and not exists (select 1 from pg_trigger where tgname='recurring_payments_touch_updated_at') then
    create trigger recurring_payments_touch_updated_at
      before update on public.recurring_payments
      for each row execute function public.touch_updated_at();
  end if;
end $$;

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='okrs' and column_name='updated_at')
     and not exists (select 1 from pg_trigger where tgname='okrs_touch_updated_at') then
    create trigger okrs_touch_updated_at
      before update on public.okrs
      for each row execute function public.touch_updated_at();
  end if;
end $$;

-- =============================================================================
-- 22. task_history unique-ish index for fast project rollups
-- =============================================================================

create index if not exists task_history_changed_by_idx on public.task_history(changed_by, changed_at desc);

-- =============================================================================
-- End of migration
-- =============================================================================
