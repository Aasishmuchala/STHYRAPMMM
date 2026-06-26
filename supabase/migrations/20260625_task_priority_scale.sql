do $$
begin
  if exists (
    select 1
    from pg_type t
    join pg_enum e on e.enumtypid = t.oid
    where t.typname = 'task_priority'
      and e.enumlabel = 'med'
  ) then
    alter type public.task_priority rename value 'med' to 'medium';
  end if;
end $$;

alter type public.task_priority add value if not exists 'highest' before 'high';
alter type public.task_priority add value if not exists 'lowest' after 'low';
