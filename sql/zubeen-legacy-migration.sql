-- ══════════════════════════════════════════════════════════════════
-- ZUBEEN DA · THE LEGACY — Supabase migration (additive, standalone)
-- Page: https://studyria.qzz.io/zubeen-da
--
-- Run once in Supabase → SQL Editor. Touches NOTHING existing.
--
-- Security model:
--   • Anyone (anon + authenticated) may SUBMIT a memory, but only
--     with consent=true — submissions land as status='pending'.
--   • The public can READ only approved/featured rows.
--   • Moderation (approve / feature / reject) is restricted to
--     authenticated users whose email is in zubeen_admins.
--   • Never expose the service-role key in frontend code.
-- ══════════════════════════════════════════════════════════════════

-- ── 1. Moderation allowlist ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.zubeen_admins (
  email text PRIMARY KEY,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.zubeen_admins ENABLE ROW LEVEL SECURITY;

-- Only listed admins can see the allowlist at all
CREATE POLICY "admins read allowlist" ON public.zubeen_admins
  FOR SELECT TO authenticated
  USING (lower(email) = lower(auth.jwt() ->> 'email'));

-- ── 2. Community memories / tributes ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.zubeen_memories (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text,                                  -- optional
  favorite_song text,                                  -- optional
  memory        text NOT NULL CHECK (char_length(memory) <= 2000),
  consent       boolean NOT NULL DEFAULT false,
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','approved','rejected','featured')),
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

ALTER TABLE public.zubeen_memories ENABLE ROW LEVEL SECURITY;

-- Public can read ONLY approved/featured tributes
CREATE POLICY "public read approved tributes" ON public.zubeen_memories
  FOR SELECT TO anon, authenticated
  USING (status IN ('approved','featured'));

-- Admins (allowlist) can read everything, incl. the moderation queue
CREATE POLICY "admins read all memories" ON public.zubeen_memories
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.zubeen_admins a
    WHERE lower(a.email) = lower(auth.jwt() ->> 'email')
  ));

-- Anyone can submit — always lands as pending, consent required
CREATE POLICY "anyone submit memory" ON public.zubeen_memories
  FOR INSERT TO anon, authenticated
  WITH CHECK (consent = true AND status = 'pending');

-- Only admins can moderate (status transitions)
CREATE POLICY "admins moderate memories" ON public.zubeen_memories
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.zubeen_admins a
    WHERE lower(a.email) = lower(auth.jwt() ->> 'email')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.zubeen_admins a
    WHERE lower(a.email) = lower(auth.jwt() ->> 'email')
  ));

-- Only admins can delete submissions
CREATE POLICY "admins delete memories" ON public.zubeen_memories
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.zubeen_admins a
    WHERE lower(a.email) = lower(auth.jwt() ->> 'email')
  ));

-- updated_at touch trigger
CREATE OR REPLACE FUNCTION public.zubeen_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zubeen_memories_touch ON public.zubeen_memories;
CREATE TRIGGER zubeen_memories_touch
  BEFORE UPDATE ON public.zubeen_memories
  FOR EACH ROW EXECUTE FUNCTION public.zubeen_touch_updated_at();

-- ── 3. Add yourself as moderator (REQUIRED — edit the email) ───────
-- INSERT INTO public.zubeen_admins (email) VALUES ('your-admin-email@example.com');
