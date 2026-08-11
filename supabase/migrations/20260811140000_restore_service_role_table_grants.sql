-- Restore service_role table DML privileges.
--
-- Symptom: Admin AI grading (createAdminClient / SUPABASE_SERVICE_ROLE_KEY)
-- failed with: permission denied for table lesson_progress
--
-- Diagnosis (remote): service_role retained only REFERENCES/TRIGGER/TRUNCATE on
-- lesson_progress and most other public tables — no SELECT/INSERT/UPDATE/DELETE.
-- authenticated already had SELECT/INSERT/UPDATE via 0012_grant_authenticated_table_access.
-- service_role has BYPASSRLS, so this was a GRANT issue (not RLS / not invalid API key).
-- No tracked migration REVOKE'd these privileges; restore the Supabase convention
-- that service_role has full access for trusted server workflows.

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Future tables/sequences created by postgres keep the same convention.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON SEQUENCES TO service_role;

-- Reaffirm learner client grants used by submit/progress flows (idempotent).
GRANT SELECT, INSERT, UPDATE ON public.lesson_progress TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oscal_findings TO authenticated;
GRANT SELECT ON public.lessons TO authenticated;
GRANT SELECT ON public.users TO authenticated;
