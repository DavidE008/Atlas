-- Prevent direct RPC execution of the SECURITY DEFINER signup trigger.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;

-- Cover application foreign keys used by owner lookups and cascades.
CREATE INDEX IF NOT EXISTS missions_created_by_idx ON public.missions (created_by);
CREATE INDEX IF NOT EXISTS mission_submissions_user_id_idx ON public.mission_submissions (user_id);
CREATE INDEX IF NOT EXISTS reports_user_id_idx ON public.reports (user_id);
CREATE INDEX IF NOT EXISTS report_verifications_report_id_idx ON public.report_verifications (report_id);

-- mission_id already has a unique constraint and its backing index.
DROP INDEX IF EXISTS public.mission_submissions_mission_idx;
