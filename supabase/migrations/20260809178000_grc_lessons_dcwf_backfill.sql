-- Backfill GRC lessons.dcwf_code with verified 722 (ISSM).
--
-- Only the GRC track currently has lessons. Three of four were seeded NULL
-- in 0005; the artifact lab already used 722. Align remaining conceptual /
-- tool-walkthrough lessons to the same verified GRC/ISSO mapping, then
-- require lessons.dcwf_code once every lesson row is mapped.
--
-- Source (live CCP PDF):
--   https://dl.dod.cyber.mil/wp-content/uploads/ccp/pdf/722_Information_Systems_Security_Manager.pdf

UPDATE public.lessons AS l
SET dcwf_code = '722'
WHERE l.dcwf_code IS NULL
  AND l.track_id = (SELECT id FROM public.tracks WHERE slug = 'grc');

DO $$
DECLARE
  null_lessons integer;
BEGIN
  SELECT count(*) INTO null_lessons
  FROM public.lessons
  WHERE dcwf_code IS NULL;

  IF null_lessons > 0 THEN
    RAISE EXCEPTION
      'Refusing NOT NULL on lessons.dcwf_code: % lesson(s) still unmapped',
      null_lessons;
  END IF;
END $$;

ALTER TABLE public.lessons
  ALTER COLUMN dcwf_code SET NOT NULL;

COMMENT ON COLUMN public.lessons.dcwf_code IS
  'Required DCWF work-role code. Must reference a manually verified work_role_codes row; do not invent placeholders for public portfolios.';
