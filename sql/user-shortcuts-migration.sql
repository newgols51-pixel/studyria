-- ═══════════════════════════════════════════════════════════════════
-- STUDYRIA — "My Shortcuts" V8 — ADDITIVE MIGRATION (SAFE)
-- ───────────────────────────────────────────────────────────────────
-- Creates ONE new table: user_shortcut_prefs
--   • purely additive — touches NO existing table, NO data
--   • per-user: one row per authenticated user (user_id PK)
--   • server-side max-4 enforcement via CHECK constraint
--   • server-side allowlist enforcement via CHECK constraint
--   • RLS enabled: a user can only read/write their OWN row
--   • no service-role key needed anywhere in the frontend
--
-- Run ONCE in Supabase → SQL Editor (or via run-fix-migration pattern
-- with the service key). Until applied, the frontend gracefully keeps
-- each user's shortcuts in localStorage (honest per-device state) and
-- syncs automatically once this table exists.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.user_shortcut_prefs (
  user_id       uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  shortcut_ids  jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at    timestamptz NOT NULL DEFAULT now(),

  -- Max 4 shortcuts, ever (server-side enforcement)
  CONSTRAINT user_shortcut_prefs_max4
    CHECK (jsonb_typeof(shortcut_ids) = 'array'
           AND jsonb_array_length(shortcut_ids) <= 4),

  -- Only approved route IDs from the fixed allowlist.
  -- Must stay in sync with shortcut-core.js ALLOWLIST.
  CONSTRAINT user_shortcut_prefs_allowlist
    CHECK (NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(shortcut_ids) AS el(id)
      WHERE el.id NOT IN (
        'home', 'library', 'free-materials', 'premium', 'career-hub',
        'dashboard', 'wishlist', 'campus', 'my-library', 'brainlab',
        'brainlab-mocks', 'brainlab-quizzes', 'brainlab-pyq',
        'brainlab-affairs', 'brainlab-leader', 'brainlab-perf'
      )
    )),

  -- Only string elements allowed
  CONSTRAINT user_shortcut_prefs_strings
    CHECK (NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(shortcut_ids) AS el(v)
      WHERE jsonb_typeof(el.v) <> 'string'
    ))
);

-- Row Level Security: users see & modify ONLY their own row
ALTER TABLE public.user_shortcut_prefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_read_own_shortcuts" ON public.user_shortcut_prefs;
CREATE POLICY "user_read_own_shortcuts" ON public.user_shortcut_prefs
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_insert_own_shortcuts" ON public.user_shortcut_prefs;
CREATE POLICY "user_insert_own_shortcuts" ON public.user_shortcut_prefs
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_update_own_shortcuts" ON public.user_shortcut_prefs;
CREATE POLICY "user_update_own_shortcuts" ON public.user_shortcut_prefs
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- NOTE: no DELETE policy on purpose — upsert is the only write path.
-- (A user deleting their row is handled by upserting '[]' if ever needed.)
