-- Authenticated users need INSERT to enroll via /api/enroll (RLS policy exists in 0015).
GRANT INSERT ON public.track_enrollments TO authenticated;
