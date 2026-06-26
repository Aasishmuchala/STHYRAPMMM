create extension if not exists pgcrypto;

create table if not exists public.recurring_payments (
  id uuid primary key default gen_random_uuid(),
  division_id uuid not null references public.divisions(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  profile_id uuid references public.profiles(id) on delete set null,
  kind text not null,
  cadence text not null,
  label text not null,
  vendor text,
  amount_paise integer not null,
  starts_on date not null,
  ends_on date,
  status text not null default 'active',
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint recurring_payments_kind_check check (kind in ('salary', 'subscription')),
  constraint recurring_payments_cadence_check check (cadence in ('monthly', 'annual')),
  constraint recurring_payments_status_check check (status in ('active', 'ended')),
  constraint recurring_payments_amount_check check (amount_paise > 0),
  constraint recurring_payments_salary_monthly_check check (kind <> 'salary' or cadence = 'monthly'),
  constraint recurring_payments_salary_profile_check check (kind <> 'salary' or profile_id is not null),
  constraint recurring_payments_dates_check check (ends_on is null or ends_on >= starts_on)
);

create index if not exists recurring_payments_division_idx
  on public.recurring_payments (division_id)
  where deleted_at is null;

create index if not exists recurring_payments_profile_idx
  on public.recurring_payments (profile_id)
  where deleted_at is null;

create index if not exists recurring_payments_kind_idx
  on public.recurring_payments (kind, cadence)
  where deleted_at is null;

create table if not exists public.finance_import_batches (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  row_count integer not null default 0,
  imported_rows integer not null default 0,
  status text not null default 'pending',
  error_summary text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint finance_import_batches_status_check check (status in ('pending', 'completed', 'failed'))
);

create index if not exists finance_import_batches_created_idx
  on public.finance_import_batches (created_at desc);

alter table public.transactions
  add column if not exists source text,
  add column if not exists recurring_payment_id uuid,
  add column if not exists import_batch_id uuid,
  add column if not exists external_ref text;

update public.transactions
set source = coalesce(source, 'manual')
where source is null;

alter table public.transactions
  alter column source set default 'manual';

alter table public.transactions
  alter column source set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'transactions_source_check'
  ) then
    alter table public.transactions
      add constraint transactions_source_check
      check (source in ('manual', 'csv_import'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'transactions_recurring_payment_id_fkey'
  ) then
    alter table public.transactions
      add constraint transactions_recurring_payment_id_fkey
      foreign key (recurring_payment_id)
      references public.recurring_payments(id)
      on update cascade
      on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'transactions_import_batch_id_fkey'
  ) then
    alter table public.transactions
      add constraint transactions_import_batch_id_fkey
      foreign key (import_batch_id)
      references public.finance_import_batches(id)
      on update cascade
      on delete set null;
  end if;
end $$;

create index if not exists transactions_source_idx
  on public.transactions (source)
  where deleted_at is null;

create index if not exists transactions_import_batch_idx
  on public.transactions (import_batch_id)
  where import_batch_id is not null;

create index if not exists transactions_recurring_payment_idx
  on public.transactions (recurring_payment_id)
  where recurring_payment_id is not null;

alter table public.recurring_payments enable row level security;
alter table public.finance_import_batches enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'recurring_payments'
      and policyname = 'owners and leads manage recurring payments'
  ) then
    create policy "owners and leads manage recurring payments"
      on public.recurring_payments
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
      and tablename = 'finance_import_batches'
      and policyname = 'owners and leads manage finance imports'
  ) then
    create policy "owners and leads manage finance imports"
      on public.finance_import_batches
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
