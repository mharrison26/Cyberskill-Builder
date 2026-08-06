-- RLS policies in 0006+ filter rows but do not grant table privileges.
-- Without these GRANTs, authenticated/anon clients get permission denied
-- and the app treats failed reads as "no profile" -> redirect to /checkout.

GRANT SELECT ON public.users TO authenticated;
GRANT SELECT ON public.track_enrollments TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tracks TO authenticated;
GRANT SELECT ON public.tracks TO anon;

GRANT SELECT ON public.lessons TO authenticated;

GRANT SELECT, INSERT, UPDATE ON public.lesson_progress TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.oscal_findings TO authenticated;
GRANT SELECT ON public.oscal_findings TO anon;
