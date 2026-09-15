-- ══════════════════════════════════════════════════════════════════
-- NOTIFICATION PREFERENCES — OPTIONAL account-level sync (v158+)
-- ══════════════════════════════════════════════════════════════════
-- Run ONCE in Supabase SQL Editor to make notification preferences
-- follow the user across devices (browser + installed PWA).
--
-- WITHOUT this migration everything still works: preferences persist
-- per-user in localStorage (device-local). With it, the Notification
-- Center transparently syncs prefs to the signed-in account and the
-- UI shows "✓ Saved — synced to your Studyria account."
--
-- Safe: idempotent (IF NOT EXISTS), RLS-enforced, no data changes.
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.notification_prefs (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  prefs      jsonb   NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Row-Level Security: every user sees and manages ONLY their own row.
ALTER TABLE public.notification_prefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notif_prefs_select_own" ON public.notification_prefs;
CREATE POLICY "notif_prefs_select_own" ON public.notification_prefs
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "notif_prefs_insert_own" ON public.notification_prefs;
CREATE POLICY "notif_prefs_insert_own" ON public.notification_prefs
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "notif_prefs_update_own" ON public.notification_prefs;
CREATE POLICY "notif_prefs_update_own" ON public.notification_prefs
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE ON public.notification_prefs TO authenticated;
NOTIFY pgrst, 'reload schema';
