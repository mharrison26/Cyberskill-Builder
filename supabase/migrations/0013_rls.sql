-- Tenant-scoped RLS for users, track_enrollments, lesson_progress, oscal_findings.
--
-- Filename note: requested as 0002_rls.sql, but 0002_handle_new_user.sql already
-- exists in this repo. Supabase applies migrations by unique filename; using 0013
-- keeps chronological order after 0012_grant_authenticated_table_access.sql.
--
-- Why auth.uid() / JWT claims instead of SET LOCAL session variables:
-- Supabase routes client queries through PgBouncer transaction pooling, which
-- does not reliably preserve SET LOCAL across the full request lifecycle. We scope
-- tenants via auth.jwt() ->> 'tenant_id' and rows via auth.uid() instead.
--
-- Prerequisite: an Auth hook (or sign-up metadata pipeline) must copy public.users.tenant_id
-- into the JWT as a custom claim, e.g. app_metadata.tenant_id, so that
-- (auth.jwt() ->> 'tenant_id')::uuid matches the user's tenant. Until that claim
-- exists, tenant-scoped policies will deny access (fail closed).

-- ---------------------------------------------------------------------------
-- Helper
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.jwt_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(auth.jwt() ->> 'tenant_id', '')::uuid;
$$;

COMMENT ON FUNCTION public.jwt_tenant_id() IS
  'Tenant UUID from JWT custom claim tenant_id (set via Auth hook).';

GRANT EXECUTE ON FUNCTION public.jwt_tenant_id() TO authenticated;

-- ---------------------------------------------------------------------------
-- Drop superseded policies on target tables
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users read own profile" ON public.users;
DROP POLICY IF EXISTS "Admins read all users" ON public.users;

DROP POLICY IF EXISTS "Users read own enrollments" ON public.track_enrollments;

DROP POLICY IF EXISTS "Students read own progress" ON public.lesson_progress;
DROP POLICY IF EXISTS "Students insert own progress" ON public.lesson_progress;
DROP POLICY IF EXISTS "Students update own progress" ON public.lesson_progress;

DROP POLICY IF EXISTS "Students read own findings" ON public.oscal_findings;
DROP POLICY IF EXISTS "Students insert own findings" ON public.oscal_findings;
DROP POLICY IF EXISTS "Admins manage findings" ON public.oscal_findings;
-- Keep "Public read public findings" (0011) for anon portfolio reads.

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users FORCE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users read own profile"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = public.jwt_tenant_id()
    AND id = auth.uid()
  );

CREATE POLICY "Admins manage users"
  ON public.users
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------------
-- track_enrollments
-- ---------------------------------------------------------------------------
ALTER TABLE public.track_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.track_enrollments FORCE ROW LEVEL SECURITY;

CREATE POLICY "Tenant read enrollments"
  ON public.track_enrollments
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = public.jwt_tenant_id()
    OR public.is_admin()
  );

CREATE POLICY "Tenant insert own enrollments"
  ON public.track_enrollments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = public.jwt_tenant_id()
    AND student_id = auth.uid()
  );

CREATE POLICY "Tenant update own enrollments"
  ON public.track_enrollments
  FOR UPDATE
  TO authenticated
  USING (
    tenant_id = public.jwt_tenant_id()
    AND student_id = auth.uid()
  )
  WITH CHECK (
    tenant_id = public.jwt_tenant_id()
    AND student_id = auth.uid()
  );

CREATE POLICY "Admins manage enrollments"
  ON public.track_enrollments
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------------
-- lesson_progress (no tenant_id column — scope via users.tenant_id)
-- ---------------------------------------------------------------------------
ALTER TABLE public.lesson_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_progress FORCE ROW LEVEL SECURITY;

CREATE POLICY "Tenant students read own progress"
  ON public.lesson_progress
  FOR SELECT
  TO authenticated
  USING (
    (
      student_id = auth.uid()
      AND EXISTS (
        SELECT 1
        FROM public.users AS u
        WHERE u.id = lesson_progress.student_id
          AND u.tenant_id = public.jwt_tenant_id()
      )
    )
    OR public.is_admin()
  );

CREATE POLICY "Tenant students insert own progress"
  ON public.lesson_progress
  FOR INSERT
  TO authenticated
  WITH CHECK (
    student_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.users AS u
      WHERE u.id = lesson_progress.student_id
        AND u.tenant_id = public.jwt_tenant_id()
    )
  );

CREATE POLICY "Tenant students update own progress"
  ON public.lesson_progress
  FOR UPDATE
  TO authenticated
  USING (
    student_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.users AS u
      WHERE u.id = lesson_progress.student_id
        AND u.tenant_id = public.jwt_tenant_id()
    )
  )
  WITH CHECK (
    student_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.users AS u
      WHERE u.id = lesson_progress.student_id
        AND u.tenant_id = public.jwt_tenant_id()
    )
  );

CREATE POLICY "Admins manage lesson progress"
  ON public.lesson_progress
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------------
-- oscal_findings
-- ---------------------------------------------------------------------------
ALTER TABLE public.oscal_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oscal_findings FORCE ROW LEVEL SECURITY;

CREATE POLICY "Tenant students read own findings"
  ON public.oscal_findings
  FOR SELECT
  TO authenticated
  USING (
    (
      tenant_id = public.jwt_tenant_id()
      AND student_id = auth.uid()
    )
    OR public.is_admin()
  );

CREATE POLICY "Tenant students insert own findings"
  ON public.oscal_findings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = public.jwt_tenant_id()
    AND student_id = auth.uid()
  );

CREATE POLICY "Tenant students update own findings"
  ON public.oscal_findings
  FOR UPDATE
  TO authenticated
  USING (
    tenant_id = public.jwt_tenant_id()
    AND student_id = auth.uid()
  )
  WITH CHECK (
    tenant_id = public.jwt_tenant_id()
    AND student_id = auth.uid()
  );

CREATE POLICY "Admins manage findings"
  ON public.oscal_findings
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
