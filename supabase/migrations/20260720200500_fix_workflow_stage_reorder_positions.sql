-- Fix workflow stage reordering under the unique (workflow_id, position) constraint.
-- The previous RPC updated rows directly into final positions. If another row
-- already owned that position, Postgres raised workflow_stages_workflow_position_unique
-- before the later updates could complete.

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
  stage_count int;
begin
  if not exists (
    select 1
    from public.task_workflows tw
    where tw.id = workflow_id_param
      and (
        (tw.project_id is null and public.is_super_admin())
        or (tw.project_id is not null and public.can_manage_project(tw.project_id))
      )
  ) then
    raise exception 'Not authorized to reorder these stages';
  end if;

  select count(*)
    into stage_count
    from public.workflow_stages
    where workflow_id = workflow_id_param;

  if coalesce(array_length(ordered_stage_ids, 1), 0) <> stage_count then
    raise exception 'Ordered stages do not match this workflow';
  end if;

  if exists (
    select 1
    from unnest(ordered_stage_ids) as ordered(id)
    left join public.workflow_stages ws
      on ws.id = ordered.id
     and ws.workflow_id = workflow_id_param
    where ws.id is null
  ) then
    raise exception 'Ordered stages include a stage outside this workflow';
  end if;

  -- First move the entire workflow away from the final range. This makes the
  -- following final-position updates safe even with a non-deferrable unique
  -- constraint.
  update public.workflow_stages
     set position = position + 10000
   where workflow_id = workflow_id_param;

  for i in 1..array_length(ordered_stage_ids, 1) loop
    sid := ordered_stage_ids[i];
    update public.workflow_stages
       set position = i * 10
     where id = sid
       and workflow_id = workflow_id_param;
  end loop;
end;
$$;

revoke all on function public.reorder_workflow_stages(uuid, uuid[]) from public;
grant execute on function public.reorder_workflow_stages(uuid, uuid[]) to authenticated;
