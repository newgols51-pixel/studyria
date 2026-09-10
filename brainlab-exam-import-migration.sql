-- ═══════════════════════════════════════════════════════════════════
-- brainlab-exam-import-migration.sql — STUDYRIA EXAM UNIVERSE v2
-- Additive only. No existing table/column touched. No data deleted.
--
-- PURPOSE: safe admin import of verified exam questions / PYQs for
-- the Exam Universe preparation system (bl_exam_questions).
--
-- RUN (Supabase SQL editor, service role):
--   1) Review the whole file first.
--   2) Execute. Everything is IF NOT EXISTS — safe to re-run.
--
-- SECURITY / RLS:
--   • PUBLIC (anon, any user): can SELECT ONLY rows that are
--     verified = true AND status = 'active'. Unverified/draft rows
--     are invisible to non-admins.
--   • ADMIN (admin_users.email ↔ JWT email): full INSERT/UPDATE/DELETE.
--   • Service-role credentials are NEVER used by the frontend.
-- ═══════════════════════════════════════════════════════════════════

-- 1. Table ---------------------------------------------------------------
create table if not exists public.bl_exam_questions (
  id            bigint generated always as identity primary key,
  exam_id       text        not null,             -- registry id: adre, adre4, apsc, police, tet, ssc, dhs, other
  subject       text        not null,
  topic         text,
  difficulty    text        default 'medium',
  language      text        default 'en',
  question_text text        not null,
  opt_a         text        not null,
  opt_b         text        not null,
  opt_c         text        not null,
  opt_d         text        not null,
  answer        text        not null check (answer in ('a','b','c','d')),
  explanation   text,
  opt_a_as      text, opt_b_as text, opt_c_as text, opt_d_as text,   -- Assamese options (optional)
  source_name   text,                                       -- e.g. 'APSC'
  source_year   int,                                        -- e.g. 2019
  paper_name    text,                                       -- e.g. 'Paper 1'
  question_number int,
  is_pyq        boolean     default false,
  verified      boolean     default false,      -- ONLY verified=true counts toward metrics
  status        text        default 'active',
  created_at    timestamptz default now()
);

-- 2. Indexes (scalable to 100+ exams) ------------------------------------
create index if not exists bl_exam_questions_exam_idx    on public.bl_exam_questions (exam_id);
create index if not exists bl_exam_questions_pyq_idx     on public.bl_exam_questions (is_pyq) where is_pyq;
create index if not exists bl_exam_questions_verif_idx   on public.bl_exam_questions (verified, status);
create unique index if not exists bl_exam_questions_dedupe_idx
  on public.bl_exam_questions (exam_id, md5(lower(regexp_replace(question_text, '[^a-zA-Z0-9]', '', 'g'))));

-- 3. RLS ------------------------------------------------------------------
alter table public.bl_exam_questions enable row level security;

-- public read: verified + active only
drop policy if exists "bl_exam_questions_public_read" on public.bl_exam_questions;
create policy "bl_exam_questions_public_read" on public.bl_exam_questions
  for select using (verified = true and status = 'active');

-- admin writes (inline admin check — no dependency on other migrations)
drop policy if exists "bl_exam_questions_admin_insert" on public.bl_exam_questions;
create policy "bl_exam_questions_admin_insert" on public.bl_exam_questions
  for insert with check (
    exists (select 1 from public.admin_users au
            where au.email = coalesce(auth.jwt()->>'email', ''))
  );

drop policy if exists "bl_exam_questions_admin_update" on public.bl_exam_questions;
create policy "bl_exam_questions_admin_update" on public.bl_exam_questions
  for update using (
    exists (select 1 from public.admin_users au
            where au.email = coalesce(auth.jwt()->>'email', ''))
  );

drop policy if exists "bl_exam_questions_admin_delete" on public.bl_exam_questions;
create policy "bl_exam_questions_admin_delete" on public.bl_exam_questions
  for delete using (
    exists (select 1 from public.admin_users au
            where au.email = coalesce(auth.jwt()->>'email', ''))
  );

-- NOTE: if admin_users uses a different key column (e.g. id/user_id),
-- adjust `au.email` accordingly before running. Verify with:
--   select * from admin_users limit 5;
