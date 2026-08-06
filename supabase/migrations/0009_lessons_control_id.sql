-- Associate lessons with NIST SP 800-53 controls for AI grading.

ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS control_id text;

COMMENT ON COLUMN public.lessons.control_id IS
  'Primary NIST SP 800-53 control id (OSCAL id, e.g. ac-2) used when grading artifact lab submissions.';

UPDATE public.lessons
SET control_id = 'ac-2'
WHERE title = 'Evidence Collection & Validation'
  AND track_id = (SELECT id FROM public.tracks WHERE slug = 'grc')
  AND control_id IS NULL;
