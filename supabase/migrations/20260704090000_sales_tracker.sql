-- Sales & marketing tracker: per-company monthly targets, a deal pipeline by
-- segment (Real Estate / SMB / D2C), and a daily outreach-activity log.
-- Access mirrors the app: managers (can_manage_division) see the whole team;
-- a member sees only their own deals/activity.

-- ── Monthly targets, per company ────────────────────────────────────────────
create table if not exists public.sales_targets (
  id                    uuid primary key default gen_random_uuid(),
  division_id           uuid not null references public.divisions(id) on delete cascade,
  month                 date not null,                         -- first day of the month
  revenue_target_paise  bigint  not null default 0,
  deals_target          integer not null default 0,
  calls_target_daily    integer not null default 0,
  emails_target_daily   integer not null default 0,
  meetings_target_month integer not null default 0,
  created_by            uuid references public.profiles(id),
  updated_at            timestamptz not null default now()
);
create unique index if not exists sales_targets_div_month_unique
  on public.sales_targets (division_id, month);

-- ── Deal pipeline ───────────────────────────────────────────────────────────
create table if not exists public.sales_deals (
  id             uuid primary key default gen_random_uuid(),
  division_id    uuid not null references public.divisions(id) on delete cascade,
  owner_id       uuid not null references public.profiles(id) on delete cascade,
  title          text not null,
  company_name   text,
  segment        text not null default 'other'
                 check (segment in ('real_estate', 'smb', 'd2c', 'other')),
  stage          text not null default 'lead'
                 check (stage in ('lead', 'contacted', 'meeting', 'proposal', 'won', 'lost')),
  value_paise    bigint not null default 0,
  expected_close date,
  closed_at      timestamptz,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists sales_deals_div_stage_idx on public.sales_deals (division_id, stage);
create index if not exists sales_deals_owner_idx on public.sales_deals (owner_id);

-- ── Daily outreach activity, per person ─────────────────────────────────────
create table if not exists public.sales_activities (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  division_id   uuid not null references public.divisions(id) on delete cascade,
  activity_date date not null default (now() at time zone 'utc')::date,
  calls         integer not null default 0,
  emails        integer not null default 0,
  meetings      integer not null default 0,
  notes         text,
  updated_at    timestamptz not null default now()
);
create unique index if not exists sales_activities_user_div_date_unique
  on public.sales_activities (user_id, division_id, activity_date);

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.sales_targets    enable row level security;
alter table public.sales_deals      enable row level security;
alter table public.sales_activities enable row level security;

drop policy if exists "members read sales targets" on public.sales_targets;
drop policy if exists "managers manage sales targets" on public.sales_targets;
drop policy if exists "read own or managed deals" on public.sales_deals;
drop policy if exists "write own or managed deals" on public.sales_deals;
drop policy if exists "update own or managed deals" on public.sales_deals;
drop policy if exists "delete own or managed deals" on public.sales_deals;
drop policy if exists "read own or managed activity" on public.sales_activities;
drop policy if exists "write own activity" on public.sales_activities;
drop policy if exists "update own activity" on public.sales_activities;

-- Targets: any member sees them; only managers set them.
create policy "members read sales targets" on public.sales_targets
  for select using (public.can_access_workspace_division(division_id));
create policy "managers manage sales targets" on public.sales_targets
  for all using (public.can_manage_division(division_id))
  with check (public.can_manage_division(division_id));

-- Deals: owner or a manager can see/edit; a member creates only their own.
create policy "read own or managed deals" on public.sales_deals
  for select using (owner_id = auth.uid() or public.can_manage_division(division_id));
create policy "write own or managed deals" on public.sales_deals
  for insert with check (
    public.can_access_workspace_division(division_id)
    and (owner_id = auth.uid() or public.can_manage_division(division_id))
  );
create policy "update own or managed deals" on public.sales_deals
  for update using (owner_id = auth.uid() or public.can_manage_division(division_id))
  with check (owner_id = auth.uid() or public.can_manage_division(division_id));
create policy "delete own or managed deals" on public.sales_deals
  for delete using (owner_id = auth.uid() or public.can_manage_division(division_id));

-- Activity: owner or manager reads; a member writes only their own.
create policy "read own or managed activity" on public.sales_activities
  for select using (user_id = auth.uid() or public.can_manage_division(division_id));
create policy "write own activity" on public.sales_activities
  for insert with check (user_id = auth.uid() and public.can_access_workspace_division(division_id));
create policy "update own activity" on public.sales_activities
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
