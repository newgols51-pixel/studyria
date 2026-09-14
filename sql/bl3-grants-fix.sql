-- STUDYRIA BRAINLAB TESTS v3 — grants fix (run if the Test Engine panel
-- says migration not active even though you already ran the migration).
GRANT SELECT ON TABLE public.bl_test_blueprints TO anon, authenticated;
GRANT SELECT ON TABLE public.bl_question_registry TO anon, authenticated;
GRANT INSERT, SELECT ON TABLE public.bl_question_usage TO authenticated;
GRANT INSERT, SELECT ON TABLE public.bl_test_versions TO authenticated;
NOTIFY pgrst, 'reload schema';
