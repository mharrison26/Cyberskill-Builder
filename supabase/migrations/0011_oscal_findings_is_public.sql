-- Public portfolio support: is_public findings, username lookup, RLS for anon reads.
--
-- Username lookup strategy:
--   1. Match explicit public.users.username (case-insensitive), when set.
--   2. Fallback: email slug = lower(replace(split_part(email, '@', 1), '.', '-'))
--      e.g. murray.d.harrison26@outlook.com -> murray-d-harrison26
-- Portfolio pages call get_user_by_username() (SECURITY DEFINER) so anon clients
-- can resolve a slug without exposing the full users table.

ALTER TABLE public.oscal_findings
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.oscal_findings.is_public IS
  'When true, finding appears on the student public portfolio (readable by anon via RLS).';

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS username text;

CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_unique_idx
  ON public.users (lower(username))
  WHERE username IS NOT NULL;

COMMENT ON COLUMN public.users.username IS
  'Optional public portfolio slug. When null, lookup uses email_slug(email).';

UPDATE public.users
SET username = 'mharrison26'
WHERE email = 'murray.d.harrison26@outlook.com'
  AND username IS NULL;

CREATE OR REPLACE FUNCTION public.email_slug(p_email text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(replace(split_part(p_email, '@', 1), '.', '-'));
$$;

COMMENT ON FUNCTION public.email_slug(text) IS
  'Portfolio slug from email local part: dots to hyphens, lowercased.';

CREATE OR REPLACE FUNCTION public.get_user_by_username(p_username text)
RETURNS TABLE (
  id uuid,
  email text,
  username text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id, u.email, u.username
  FROM public.users u
  WHERE lower(u.username) = lower(p_username)
     OR public.email_slug(u.email) = lower(p_username)
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_user_by_username(text) IS
  'Resolve a portfolio slug to a user row (explicit username or email slug).';

GRANT EXECUTE ON FUNCTION public.get_user_by_username(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_student_active_tracks(p_student_id uuid)
RETURNS TABLE (
  track_id uuid,
  track_name text,
  track_slug text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id, t.name, t.slug
  FROM public.track_enrollments te
  JOIN public.tracks t ON t.id = te.track_id
  WHERE te.student_id = p_student_id
    AND te.status = 'active'
  ORDER BY t.name;
$$;

COMMENT ON FUNCTION public.get_student_active_tracks(uuid) IS
  'Active track enrollments for public portfolio display.';

GRANT EXECUTE ON FUNCTION public.get_student_active_tracks(uuid) TO anon, authenticated;

CREATE POLICY "Public read public findings"
  ON public.oscal_findings
  FOR SELECT
  TO anon, authenticated
  USING (is_public = true);

CREATE POLICY "Anon read tracks"
  ON public.tracks
  FOR SELECT
  TO anon
  USING (true);
