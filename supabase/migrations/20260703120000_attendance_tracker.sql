-- Attendance tracker: owner-defined geofenced locations + per-person, geo-verified
-- daily check-ins. Access mirrors the rest of the app via the existing helpers
-- can_access_workspace_division() / can_manage_division() (see
-- 20260627110000_roles_company_access_and_task_assignment.sql):
--   * a location is readable by any company member (needed to validate a
--     check-in) and manageable only by owner/lead/super-admin;
--   * an attendance record is readable by its owner OR a manager of the company,
--     and a member can only insert their own check-in.

-- ── Geofenced locations (owner-defined) ─────────────────────────────────────
create table if not exists public.attendance_locations (
  id           uuid primary key default gen_random_uuid(),
  division_id  uuid not null references public.divisions(id) on delete cascade,
  name         text not null,
  latitude     double precision not null,
  longitude    double precision not null,
  -- Metres. GPS on phones is ~10–30m accurate, so 5m will reject people who are
  -- actually present; default to something workable and let the owner tune it.
  radius_m     integer not null default 50 check (radius_m > 0 and radius_m <= 10000),
  created_by   uuid references public.profiles(id),
  created_at   timestamptz not null default now()
);

-- Location names must be unique within a company (case-insensitive) — no dupes.
create unique index if not exists attendance_locations_name_unique
  on public.attendance_locations (division_id, lower(name));

-- ── Per-person check-in records ─────────────────────────────────────────────
create table if not exists public.attendance_records (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  division_id   uuid not null references public.divisions(id) on delete cascade,
  location_id   uuid references public.attendance_locations(id) on delete set null,
  work_date     date not null default (now() at time zone 'utc')::date,
  checked_in_at timestamptz not null default now(),
  -- Raw GPS captured at check-in, kept for auditing borderline cases.
  latitude      double precision,
  longitude     double precision,
  accuracy_m    double precision,
  distance_m    double precision,
  status        text not null default 'present'
                check (status in ('present', 'late', 'undertime', 'absent')),
  created_at    timestamptz not null default now()
);

-- One check-in per person per day (the daily 6am link is a single daily mark).
create unique index if not exists attendance_records_daily_unique
  on public.attendance_records (user_id, work_date);

create index if not exists attendance_records_division_date_idx
  on public.attendance_records (division_id, work_date desc);

-- ── Row-level security ──────────────────────────────────────────────────────
alter table public.attendance_locations enable row level security;
alter table public.attendance_records   enable row level security;

drop policy if exists "members read attendance locations" on public.attendance_locations;
drop policy if exists "managers manage attendance locations" on public.attendance_locations;
drop policy if exists "read own or managed attendance" on public.attendance_records;
drop policy if exists "insert own attendance" on public.attendance_records;

create policy "members read attendance locations"
  on public.attendance_locations
  for select
  using (public.can_access_workspace_division(division_id));

create policy "managers manage attendance locations"
  on public.attendance_locations
  for all
  using (public.can_manage_division(division_id))
  with check (public.can_manage_division(division_id));

-- Owners/managers see everyone's records in their company; a member sees only
-- their own.
create policy "read own or managed attendance"
  on public.attendance_records
  for select
  using (user_id = auth.uid() or public.can_manage_division(division_id));

-- A member may only record their OWN check-in, and only in a company they belong to.
create policy "insert own attendance"
  on public.attendance_records
  for insert
  with check (user_id = auth.uid() and public.can_access_workspace_division(division_id));
