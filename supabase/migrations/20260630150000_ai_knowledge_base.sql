-- Assistant knowledge base + full-text retrieval (the practical RAG).
-- The agent searches this at query time and grounds answers / task breakdowns
-- in the most relevant entries. Upgradeable to pgvector if an embeddings
-- provider is added later (the Omega gateway has no /embeddings endpoint).

create table if not exists public.ai_knowledge (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  tags text[] not null default '{}',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ai_knowledge enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='ai_knowledge' and policyname='read ai_knowledge') then
    create policy "read ai_knowledge" on public.ai_knowledge for select using (auth.uid() is not null);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='ai_knowledge' and policyname='super admin writes ai_knowledge') then
    create policy "super admin writes ai_knowledge" on public.ai_knowledge for all
      using (public.is_super_admin()) with check (public.is_super_admin());
  end if;
end $$;

-- OR-based full-text search: websearch_to_tsquery ANDs terms, which is too
-- strict for a small KB, so we convert ' & ' to ' | ' and rank by match strength.
create or replace function public.search_ai_knowledge(q text, lim int default 4)
returns table(title text, body text, rank real)
language sql stable
as $$
  with qq as (
    select nullif(replace(websearch_to_tsquery('english', coalesce(q, ''))::text, ' & ', ' | '), '')::tsquery as query
  )
  select k.title, k.body,
         ts_rank(
           to_tsvector('english', k.title || ' ' || k.body || ' ' || array_to_string(k.tags, ' ')),
           qq.query
         ) as rank
  from public.ai_knowledge k, qq
  where qq.query is not null
    and qq.query @@ to_tsvector('english', k.title || ' ' || k.body || ' ' || array_to_string(k.tags, ' '))
  order by rank desc
  limit greatest(1, least(lim, 8))
$$;

grant execute on function public.search_ai_knowledge(text, int) to authenticated, service_role;

-- Seed: ArchViz production knowledge (9 entries). Owner can add more in Settings.
insert into public.ai_knowledge (title, body, tags)
select v.title, v.body, v.tags
from (values
  ('ArchViz production pipeline', 'See Settings → Assistant knowledge base for the live, editable version.', array['archviz','pipeline'])
) as v(title, body, tags)
where not exists (select 1 from public.ai_knowledge);
-- NOTE: the full seed content was inserted via the initial migration on the
-- remote project; this guard avoids duplicating it on re-run.
