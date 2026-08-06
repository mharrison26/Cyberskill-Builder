-- Client-facing RLS policies for authenticated users.
-- RLS was enabled without policies, blocking all anon/authenticated reads.

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_admin FROM public.users WHERE id = auth.uid()),
    false
  );
$$;

COMMENT ON FUNCTION public.is_admin() IS
  'Returns true when the current auth user has is_admin on public.users.';

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- users: read own profile (required for dashboard, app shell, admin gate)
CREATE POLICY "Users read own profile"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- track_enrollments: read own enrollments
CREATE POLICY "Users read own enrollments"
  ON public.track_enrollments
  FOR SELECT
  TO authenticated
  USING (student_id = auth.uid());

-- tracks: catalog readable by any signed-in user; admins manage
CREATE POLICY "Authenticated users read tracks"
  ON public.tracks
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins manage tracks"
  ON public.tracks
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- lessons: active enrollees (and admins) can read track content
CREATE POLICY "Enrolled students read lessons"
  ON public.lessons
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.track_enrollments AS te
      WHERE te.student_id = auth.uid()
        AND te.track_id = lessons.track_id
        AND te.status = 'active'
    )
  );

-- lesson_progress: students manage their own progress rows
CREATE POLICY "Students read own progress"
  ON public.lesson_progress
  FOR SELECT
  TO authenticated
  USING (student_id = auth.uid());

CREATE POLICY "Students insert own progress"
  ON public.lesson_progress
  FOR INSERT
  TO authenticated
  WITH CHECK (student_id = auth.uid());

CREATE POLICY "Students update own progress"
  ON public.lesson_progress
  FOR UPDATE
  TO authenticated
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());
