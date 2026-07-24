-- Attendance is global per @sthyra.com user: one check-in event fans out to
-- one attendance_records row per division the user belongs to. So if a member
-- is in Construction Mgmt, Living Twin, and Sthyra Studios, a single check-in
-- from any of those locations writes one row per division — managers of each
-- branch see their own copy. The previous unique index was (user_id, work_date)
-- which only allowed one row per day across all divisions; relax it to
-- (user_id, work_date, division_id) so each branch gets its own daily row.

drop index if exists public.attendance_records_daily_unique;
create unique index if not exists attendance_records_daily_unique
  on public.attendance_records (user_id, work_date, division_id);