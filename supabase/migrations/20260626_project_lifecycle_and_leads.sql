alter table public.projects
  add column if not exists description text,
  add column if not exists lead_id uuid references public.profiles(id) on delete set null,
  add column if not exists starts_on date,
  add column if not exists target_end_on date;

create index if not exists projects_lead_id_idx
  on public.projects(lead_id)
  where deleted_at is null;
