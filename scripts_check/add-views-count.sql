-- ═══════════════════════════════════════════════════════════════════
-- add-views-count.sql — enables real view tracking for the 🔥 Trending
-- Now homepage section (top 12 by views_count desc).
--
-- The frontend is ALREADY wired: career-hub-v2.js chOpenDetail calls
-- the increment_job_views RPC on every job-detail open, and
-- studyria-home-v2.js ranks the Trending Now section by views_count.
-- The ranking falls back honestly (admin trending flag → newest) until
-- this SQL is run.
--
-- RUN ONCE in the Supabase Dashboard → SQL Editor → Run.
-- Safe to re-run (idempotent).
-- ═══════════════════════════════════════════════════════════════════

-- 1. Real view counter column
alter table public.jobs
  add column if not exists views_count bigint not null default 0;

-- 2. RPC the frontend already calls on every job-detail open.
--    security definer → works for anonymous visitors, single-row update only.
create or replace function public.increment_job_views(job_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.jobs
     set views_count = views_count + 1
   where id = job_id;
end;
$$;

-- 3. Let anonymous visitors fire the increment
grant execute on function public.increment_job_views(text) to anon;

-- 4. Make sure anon can READ the counter (RLS policies stay as-is otherwise)
--    (skip if the jobs select policy already allows anon reads)
grant select (id, views_count) on public.jobs to anon;
