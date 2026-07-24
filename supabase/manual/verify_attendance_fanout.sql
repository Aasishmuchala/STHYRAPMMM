-- Manual verification of the attendance fan-out.
-- Run this in the Supabase SQL editor after applying migration
-- 20260724100000_attendance_per_division_unique.sql.

-- 1. Confirm the new unique index exists and is keyed on (user_id, work_date, division_id).
select indexname, indexdef
from pg_indexes
where schemaname = 'public' and tablename = 'attendance_records';

-- 2. Inspect nikhil's memberships — should be a row per division he belongs to.
select u.email, d.slug, dm.role
from division_members dm
join profiles u on u.id = dm.user_id
join divisions d on d.id = dm.division_id
where u.email = 'nikhilt@sthyra.com'
order by d.slug;

-- 3. Same for murali — and note which divisions he/she manages (owner/lead).
select u.email, d.slug, dm.role
from division_members dm
join profiles u on u.id = dm.user_id
join divisions d on d.id = dm.division_id
where u.email = 'murali@sthyra.com'
order by d.slug;

-- 4. (Post-check-in) Confirm nikhil's rows. After one check-in from nikhil
-- inside ANY of his registered geofences, you should see one row per division
-- nikhil belongs to, all with the same work_date and checked_in_at.
select u.email, d.slug, ar.work_date, ar.checked_in_at, ar.location_id, ar.status
from attendance_records ar
join profiles u on u.id = ar.user_id
join divisions d on d.id = ar.division_id
where u.email = 'nikhilt@sthyra.com'
order by ar.work_date desc, d.slug;
