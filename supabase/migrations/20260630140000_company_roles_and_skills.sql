-- Skill / job roles catalogue (owner-managed) + per-person assignments.
-- DISTINCT from access roles (division_members.role): these describe the craft
-- a person does, so the AI can break a project into tasks and assign by skill.

create table if not exists public.company_roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort int not null default 100,
  created_at timestamptz not null default now()
);

create table if not exists public.profile_roles (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role_id uuid not null references public.company_roles(id) on delete cascade,
  primary key (profile_id, role_id)
);

create index if not exists profile_roles_profile_idx on public.profile_roles(profile_id);

alter table public.company_roles enable row level security;
alter table public.profile_roles enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='company_roles' and policyname='read company_roles') then
    create policy "read company_roles" on public.company_roles for select using (auth.uid() is not null);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='company_roles' and policyname='super admin writes company_roles') then
    create policy "super admin writes company_roles" on public.company_roles for all
      using (public.is_super_admin()) with check (public.is_super_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='profile_roles' and policyname='read profile_roles') then
    create policy "read profile_roles" on public.profile_roles for select using (auth.uid() is not null);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='profile_roles' and policyname='super admin writes profile_roles') then
    create policy "super admin writes profile_roles" on public.profile_roles for all
      using (public.is_super_admin()) with check (public.is_super_admin());
  end if;
end $$;

insert into public.company_roles (name, sort) values
  ('Unreal Engine Developer + 3D Visualizer Artist', 10),
  ('3ds Max & V-Ray Artist', 20),
  ('Graphic Designer cum Post-Production Artist', 30),
  ('Lighting Artist', 40),
  ('Full Stack Developer', 50),
  ('Architect / AutoCAD Drafter', 60),
  ('3D Modeller', 70),
  ('Texturing & Material Artist', 80),
  ('Project Lead / Art Director', 90)
on conflict (name) do nothing;
