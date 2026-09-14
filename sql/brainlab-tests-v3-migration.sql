-- ═══════════════════════════════════════════════════════════════════════
-- STUDYRIA BRAINLAB TESTS V3 — EXAM ECOSYSTEM GOVERNANCE (additive, safe)
-- Run ONCE in Supabase → SQL Editor. No existing tables modified. No drops.
--
-- Architecture (static site + Supabase governance):
--   • question CONTENT stays in the version-controlled question bank files
--     (real data, git-audited, never fabricated) — questions are NOT
--     copied into the DB.
--   • THIS migration adds the DATABASE-DRIVEN GOVERNANCE LAYER:
--       bl_test_blueprints  — one row per Test Series: the verified exam
--                             blueprint (DB overrides the JS fallback).
--       bl_question_registry — per-question-hash governance overrides:
--                             verification status, source, PYQ metadata.
--                             ABSENT hash = 'legacy' (bank question,
--                             in production since v1, shown honestly).
--                             ONLY approved/legacy questions may enter
--                             public tests. needs_review NEVER publishes.
--       bl_question_usage   — usage tracking (spec §20/§26): which
--                             question served which series/test.
--       bl_test_versions    — test snapshots (spec §28): the exact
--                             question-hash set of every generated test.
--   • Admin gating: reuses the production is_admin() helper
--     (public.users.role='admin' for the signed-in user).
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. TEST BLUEPRINTS (database-driven; JS is only a fallback) ──────────
CREATE TABLE IF NOT EXISTS public.bl_test_blueprints (
  series_id        text PRIMARY KEY,
  name             text NOT NULL,
  org              text NOT NULL DEFAULT '',
  exam_cycle       text NOT NULL DEFAULT '',
  exam_year        integer,
  total_questions  integer NOT NULL DEFAULT 0,
  total_marks      integer,
  duration_minutes integer,
  negative_marking numeric(4,2) DEFAULT 0,
  subject_dist     jsonb NOT NULL DEFAULT '[]',
  language_support jsonb NOT NULL DEFAULT '["en","as"]',
  official_source  text,
  official_source_url text,
  syllabus_source  text,
  pattern_source  text,
  verified_at      timestamptz,
  status           text NOT NULL DEFAULT 'needs_verification'
                   CHECK (status IN ('verified','needs_verification','retired')),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bl_test_blueprints ENABLE ROW LEVEL SECURITY;
CREATE POLICY bl_bp_public_read ON public.bl_test_blueprints
  FOR SELECT USING (true);
CREATE POLICY bl_bp_admin_write ON public.bl_test_blueprints
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── 2. QUESTION REGISTRY (governance overrides; content stays in bank) ───
CREATE TABLE IF NOT EXISTS public.bl_question_registry (
  qhash            text PRIMARY KEY,
  series_id        text,
  subject          text NOT NULL DEFAULT '',
  topic            text NOT NULL DEFAULT '',
  status           text NOT NULL DEFAULT 'needs_review'
                   CHECK (status IN ('approved','needs_review','rejected','legacy')),
  source           text,
  source_url       text,
  source_type      text,
  is_pyq           boolean NOT NULL DEFAULT false,
  exam_year        integer,
  paper_reference  text,
  notes            text,
  reviewed_by      text,
  reviewed_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bl_qreg_series_status ON public.bl_question_registry(series_id, status);
CREATE INDEX IF NOT EXISTS idx_bl_qreg_series_subject ON public.bl_question_registry(series_id, subject, status);

ALTER TABLE public.bl_question_registry ENABLE ROW LEVEL SECURITY;
CREATE POLICY bl_qreg_read ON public.bl_question_registry
  FOR SELECT USING (true);
CREATE POLICY bl_qreg_admin_write ON public.bl_question_registry
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── 3. QUESTION USAGE TRACKING (spec §20/§26) ────────────────────────────
CREATE TABLE IF NOT EXISTS public.bl_question_usage (
  id           bigserial PRIMARY KEY,
  qhash        text NOT NULL,
  series_id    text NOT NULL,
  test_n       integer NOT NULL,
  test_version integer NOT NULL DEFAULT 1,
  used_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bl_qu_series ON public.bl_question_usage(series_id, test_n);
CREATE UNIQUE INDEX IF NOT EXISTS uq_bl_qu_once
  ON public.bl_question_usage(qhash, series_id, test_n, test_version);

ALTER TABLE public.bl_question_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY bl_qu_insert ON public.bl_question_usage
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY bl_qu_read ON public.bl_question_usage
  FOR SELECT USING (public.is_admin());

-- ── 4. TEST VERSION SNAPSHOTS (spec §28 — attempts keep their set) ─────
CREATE TABLE IF NOT EXISTS public.bl_test_versions (
  id            bigserial PRIMARY KEY,
  series_id     text NOT NULL,
  test_n        integer NOT NULL,
  version       integer NOT NULL DEFAULT 1,
  blueprint_hash text NOT NULL DEFAULT '',
  qhashes       jsonb NOT NULL DEFAULT '[]',
  total         integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_bl_tv
  ON public.bl_test_versions(series_id, test_n, version);

ALTER TABLE public.bl_test_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY bl_tv_insert ON public.bl_test_versions
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY bl_tv_read ON public.bl_test_versions
  FOR SELECT USING (true);

-- ── 5. ADMIN RPC: registry governance (bulk, admin-gated) ────────────────
CREATE OR REPLACE FUNCTION public.bl_registry_set_status(
  p_hashes text[],
  p_status text,
  p_series text DEFAULT NULL,
  p_subject text DEFAULT NULL,
  p_notes  text DEFAULT NULL
) RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_n integer := 0;
BEGIN
  IF v_uid IS NULL THEN RETURN json_build_object('ok', false, 'reason', 'not_signed_in'); END IF;
  IF NOT public.is_admin() THEN RETURN json_build_object('ok', false, 'reason', 'not_admin'); END IF;
  IF p_status NOT IN ('approved','needs_review','rejected','legacy') THEN
    RETURN json_build_object('ok', false, 'reason', 'invalid_status');
  END IF;

  SELECT COALESCE(raw_user_meta_data->>'full_name', email) INTO v_email FROM public.users WHERE id = v_uid;

  INSERT INTO public.bl_question_registry (qhash, series_id, subject, status, reviewed_by, reviewed_at, notes, updated_at)
  SELECT h, p_series, p_subject, p_status, v_email, now(), COALESCE(p_notes,
      'Status set via Admin Test Engine — ' || to_char(now(), 'YYYY-MM-DD')), now()
  FROM unnest(p_hashes) h
  ON CONFLICT (qhash) DO UPDATE
    SET status = EXCLUDED.status,
        reviewed_by = EXCLUDED.reviewed_by,
        reviewed_at = EXCLUDED.reviewed_at,
        updated_at = now(),
        series_id = COALESCE(EXCLUDED.series_id, bl_question_registry.series_id),
        subject   = COALESCE(EXCLUDED.subject, bl_question_registry.subject);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN json_build_object('ok', true, 'updated', v_n);
END $$;
GRANT EXECUTE ON FUNCTION public.bl_registry_set_status(text[],text,text,text,text) TO authenticated;

-- ── 6. RPC: record a test version snapshot (idempotent, signed-in) ───────
CREATE OR REPLACE FUNCTION public.bl_test_version_record(
  p_series text, p_test_n integer, p_version integer, p_blueprint_hash text, p_qhashes text[]
) RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN json_build_object('ok', false, 'reason', 'not_signed_in'); END IF;
  INSERT INTO public.bl_test_versions (series_id, test_n, version, blueprint_hash, qhashes, total)
  VALUES (p_series, p_test_n, p_version, p_blueprint_hash, to_jsonb(p_qhashes), array_length(p_qhashes, 1))
  ON CONFLICT (series_id, test_n, version) DO NOTHING;
  INSERT INTO public.bl_question_usage (qhash, series_id, test_n, test_version)
  SELECT h, p_series, p_test_n, p_version FROM unnest(p_qhashes) h
  ON CONFLICT DO NOTHING;
  RETURN json_build_object('ok', true);
END $$;
GRANT EXECUTE ON FUNCTION public.bl_test_version_record(text,integer,integer,text,text[]) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- 7. SEED: VERIFIED BLUEPRINTS (from the v2 audit — sources cited).
--    These DB rows OVERRIDE the JS fallback once this migration runs.
--    needs_verification series are seeded too — flip to 'verified' only
--    after verifying the official pattern (Admin → Test Engine).
-- ═══════════════════════════════════════════════════════════════════════
INSERT INTO public.bl_test_blueprints
  (series_id, name, org, exam_cycle, total_questions, total_marks, duration_minutes,
   negative_marking, subject_dist, official_source, pattern_source, syllabus_source, status, verified_at)
VALUES
('vfa','Assam VFA Exam','Government of Assam','VFA 2026',100,100,120,0,
 '[{"k":"Biology","n":40},{"k":"Chemistry","n":20},{"k":"Physics","n":20},{"k":"General Awareness","n":20}]',
 'Official VFA 2026 recruitment information (assam.gov.in recruitment notice)',
 'VFA 2026 recruitment notice — written test pattern',
 'VFA written-test subject list (recruitment notice)',
 'verified', now()),
('constable-abub','Constable (AB/UB)','Assam Police','Constable AB/UB',100,50,100,0,
 '[{"k":"Elementary Arithmetic","n":20},{"k":"General English","n":20},{"k":"Logical Reasoning","n":20},{"k":"Assam History, Geography, Polity & Economy","n":20},{"k":"General Knowledge & Awareness","n":20}]',
 'SLPRB Assam Constable (AB/UB) official advertisement',
 'SLPRB official advertisement — 100 Q / 50 marks (0.5 per Q); duration practice-convention 1 min/Q',
 'SLPRB written test syllabus (official advertisement)', 'verified', now()),
('apsc-cce','APSC CCE Prelims','APSC','CCE Prelims · GS Paper I',100,200,120,0.5,
 '[]',
 'APSC Combined Competitive Exam Prelims — apsc.nic.in (100 Q, 200 marks, 2 hrs, negative 1/4th)',
 'APSC official notification — GS Paper I',
 'APSC GS Paper I syllabus (official)', 'verified', now()),
('ssc-gd','SSC GD','Staff Selection Commission','SSC GD CBE',80,160,60,0.25,
 '[{"k":"General Intelligence & Reasoning","n":20},{"k":"General Knowledge & General Awareness","n":20},{"k":"Elementary Mathematics","n":20},{"k":"English","n":20}]',
 'SSC GD Constable official notification (CBE pattern)',
 'SSC GD official notification — 80 Q / 160 marks / 60 min, 4 sections × 20',
 'SSC GD syllabus (official notification)', 'verified', now()),
('assam-tet','Assam TET (LP)','Assam TET Authority','Assam TET (LP)',150,150,150,0,
 '[{"k":"Child Development & Pedagogy","n":30},{"k":"Language I (Mother Tongue)","n":30},{"k":"Language II (English)","n":30},{"k":"Mathematics","n":30},{"k":"Environmental Studies","n":30}]',
 'Assam TET official pattern — 150 Q, 150 marks, 150 min, five sections × 30 (LP paper)',
 'Assam TET official notification (LP)',
 'Assam TET LP syllabus (official)', 'verified', now()),
('sub-inspector','Sub Inspector','Assam Police',NULL,NULL,NULL,NULL,NULL,'[]',
 NULL,NULL,NULL,'needs_verification',NULL),
('mts','Multi Tasking Staff','Government of Assam',NULL,NULL,NULL,NULL,NULL,'[]',
 NULL,NULL,NULL,'needs_verification',NULL),
('adre-g3','ADRE Grade III','Assam Direct Recruitment','ADRE — cycle not yet verified',NULL,NULL,NULL,NULL,'[]',
 NULL,NULL,NULL,'needs_verification',NULL),
('adre-g4','ADRE Grade IV','Assam Direct Recruitment','ADRE — cycle not yet verified',NULL,NULL,NULL,NULL,'[]',
 NULL,NULL,NULL,'needs_verification',NULL),
('adre-g3-driver','ADRE Grade III (Driver)','Assam Direct Recruitment',NULL,NULL,NULL,NULL,NULL,'[]',
 NULL,NULL,NULL,'needs_verification',NULL),
('adre-g4-viii','ADRE Grade IV (Class VIII)','Assam Direct Recruitment',NULL,NULL,NULL,NULL,NULL,'[]',
 NULL,NULL,NULL,'needs_verification',NULL),
('dhs','DHS Assam','Directorate of Health Services, Assam',NULL,NULL,NULL,NULL,NULL,'[]',
 NULL,NULL,NULL,'needs_verification',NULL)
ON CONFLICT (series_id) DO NOTHING;
