-- Let division owners read audit-log rows for the divisions they own, while
-- keeping workspace-wide rows restricted to super admins.

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'activity_log'
      and policyname = 'company owners read scoped activity log'
  ) then
    create policy "company owners read scoped activity log"
      on public.activity_log for select
      using (
        division_id is not null
        and public.has_division_role(division_id, array['owner'])
      );
  end if;
end $$;
