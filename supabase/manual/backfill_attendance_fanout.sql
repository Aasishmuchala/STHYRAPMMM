-- Backfill fan-out: for every existing attendance_records row, mirror it to
-- each OTHER division the same user is a CURRENT member of (one row per
-- (user, day, div)). Rows already present in the target division are
-- skipped. Safe to re-run.
--
-- IMPORTANT: the source of "which divisions to mirror into" is
-- division_members — NOT attendance_records. (If we used the latter, the
-- backfill would only fan out to divisions that already have an attendance
-- row, which is circular.)

-- Step 1: every user who has at least one attendance row, with their CURRENT
-- member divisions (array).
with roster as (
  select distinct ar.user_id, ar.work_date,
         (select array_agg(dm.division_id)
            from division_members dm
           where dm.user_id = ar.user_id) as div_ids
  from attendance_records ar
),
-- Step 2: expand every (user_id, work_date) into one row per member division.
pairs as (
  select r.user_id, r.work_date, d::uuid as division_id
  from roster r
  cross join lateral unnest(r.div_ids) as d
),
-- Step 3: keep only the (user_id, work_date, division_id) triples that DON'T
-- already exist in attendance_records.
missing as (
  select p.user_id, p.work_date, p.division_id
  from pairs p
  left join attendance_records ar
    on ar.user_id = p.user_id
   and ar.work_date = p.work_date
   and ar.division_id = p.division_id
  where ar.id is null
)
-- Step 4: for each missing triple, copy the audit + GPS fields from a
-- representative existing row for the same (user_id, work_date).
insert into attendance_records (
  user_id, division_id, location_id, work_date, checked_in_at,
  latitude, longitude, accuracy_m, distance_m,
  status, created_at
)
select
  m.user_id,
  m.division_id,
  -- Keep the original location_id only on the row whose division matches the
  -- source row's division; null elsewhere (the user wasn't physically there
  -- for that branch — we just need the row to exist for the manager view).
  case when ar.division_id = m.division_id then ar.location_id else null end,
  ar.work_date,
  ar.checked_in_at,
  ar.latitude, ar.longitude, ar.accuracy_m, ar.distance_m,
  ar.status,
  ar.created_at
from missing m
join lateral (
  select * from attendance_records
  where user_id = m.user_id and work_date = m.work_date
  order by id
  limit 1
) ar on true;

-- Confirm: each email/work_date should now appear once per division the user
-- belongs to.
select u.email, d.slug, ar.work_date
from attendance_records ar
join profiles u on u.id = ar.user_id
join divisions d on d.id = ar.division_id
where ar.work_date >= current_date - interval '14 days'
order by ar.work_date desc, u.email, d.slug;