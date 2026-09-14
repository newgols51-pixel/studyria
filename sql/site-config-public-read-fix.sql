-- STUDYRIA — site_config public read fix (run ONCE in Supabase SQL Editor)
-- Why: normal (non-admin) visitors currently get 0 rows from site_config —
-- admins CAN write, but nobody else can read. This silently affects the
-- BrainLab practice-set approvals AND the Pass system config (both use
-- site_config). 4 lines, safe, idempotent.
ALTER TABLE public.site_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "site_config_public_read" ON public.site_config;
CREATE POLICY "site_config_public_read" ON public.site_config
  FOR SELECT TO anon, authenticated USING (true);
