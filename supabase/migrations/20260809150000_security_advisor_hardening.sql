-- Address Supabase security advisor findings that are safe to fix in SQL:
-- - mutable search_path on non-DEFINER helpers
-- - RLS enabled with zero policies on legacy/deny-by-default tables
-- - overly broad PUBLIC EXECUTE on SECURITY DEFINER helpers/triggers
--
-- Intentionally unchanged:
-- - get_user_by_username / get_student_active_tracks (anon EXECUTE required for public portfolios)
-- - auth leaked-password protection (dashboard-only Auth setting)

-- ---------------------------------------------------------------------------
-- Function search_path
-- ---------------------------------------------------------------------------
ALTER FUNCTION public.enforce_track_enrollment_rules()
  SET search_path = public;

ALTER FUNCTION public.email_slug(text)
  SET search_path = public;

-- ---------------------------------------------------------------------------
-- RLS policies for tables that had RLS on but no policies
-- ---------------------------------------------------------------------------

-- cohort_codes: signup lookup remains SECURITY DEFINER-only for clients;
-- allow admins to manage codes via the Data API / dashboard as authenticated.
CREATE POLICY "Admins manage cohort codes"
  ON public.cohort_codes
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Legacy empty profiles table (superseded by public.users). Own-row + admin.
CREATE POLICY "Users read own legacy profile"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY "Users update own legacy profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "Users insert own legacy profile"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

CREATE POLICY "Admins manage legacy profiles"
  ON public.profiles
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Legacy empty student_scenarios stub: admin-only until a real model exists.
CREATE POLICY "Admins manage student scenarios"
  ON public.student_scenarios
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------------
-- Tighten EXECUTE on SECURITY DEFINER helpers (revoke default PUBLIC)
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

REVOKE ALL ON FUNCTION public.jwt_tenant_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.jwt_tenant_id() TO authenticated;

-- Trigger-only: not intended as PostgREST RPCs.
REVOKE ALL ON FUNCTION public.sync_oscal_finding_to_portfolio() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_oscal_finding_to_portfolio() FROM anon, authenticated;

REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM anon, authenticated;
