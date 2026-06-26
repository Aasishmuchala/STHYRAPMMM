begin;

-- One-shot workspace cleanup.
-- Keeps accounts, profiles, divisions, and memberships.
-- Clears operational/demo/business content so the workspace opens empty.

do $$
begin
  if to_regclass('public.profile_completion_daily') is not null then
    delete from public.profile_completion_daily;
  end if;

  if to_regclass('public.access_log') is not null then
    delete from public.access_log;
  end if;

  if to_regclass('public.bom_items') is not null then
    update public.bom_items set deleted_at = now() where deleted_at is null;
  end if;

  if to_regclass('public.ra_bills') is not null then
    update public.ra_bills set deleted_at = now() where deleted_at is null;
  end if;

  if to_regclass('public.invoices') is not null then
    update public.invoices set deleted_at = now() where deleted_at is null;
  end if;

  if to_regclass('public.transactions') is not null then
    update public.transactions set deleted_at = now() where deleted_at is null;
  end if;

  if to_regclass('public.finance_import_batches') is not null then
    delete from public.finance_import_batches;
  end if;

  if to_regclass('public.recurring_payments') is not null then
    update public.recurring_payments
      set deleted_at = now(),
          status = 'ended',
          ends_on = coalesce(ends_on, current_date)
      where deleted_at is null;
  end if;

  if to_regclass('public.documents') is not null then
    update public.documents
      set deleted_at = now(),
          status = case when status <> 'archived' then 'archived' else status end
      where deleted_at is null;
  end if;

  if to_regclass('public.clients') is not null then
    update public.clients set deleted_at = now() where deleted_at is null;
  end if;

  if to_regclass('public.tasks') is not null then
    update public.tasks
      set deleted_at = now(),
          cycle_id = null,
          module_id = null,
          parent_task_id = null,
          doc_id = null,
          transaction_id = null
      where deleted_at is null;
  end if;

  if to_regclass('public.project_modules') is not null then
    update public.project_modules set deleted_at = now() where deleted_at is null;
  end if;

  if to_regclass('public.project_cycles') is not null then
    update public.project_cycles set deleted_at = now() where deleted_at is null;
  end if;

  if to_regclass('public.projects') is not null then
    update public.projects
      set deleted_at = now(),
          status = case when status <> 'done' then 'paused' else status end
      where deleted_at is null;
  end if;

  if to_regclass('public.division_briefs') is not null then
    delete from public.division_briefs;
  end if;

  if to_regclass('public.invite_allowlist') is not null then
    delete from public.invite_allowlist;
  end if;
end $$;

commit;
