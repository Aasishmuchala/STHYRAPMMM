-- Mirror the Omega key into a service-role-only table so server actions can
-- use the assistant for non-owner roles without exposing the key to clients.

create table if not exists public.ai_secret_bridge (
  name text primary key,
  secret text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

alter table public.ai_secret_bridge enable row level security;

create or replace function public.touch_ai_secret_bridge_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists ai_secret_bridge_touch_updated_at on public.ai_secret_bridge;
create trigger ai_secret_bridge_touch_updated_at
  before update on public.ai_secret_bridge
  for each row
  execute function public.touch_ai_secret_bridge_updated_at();
