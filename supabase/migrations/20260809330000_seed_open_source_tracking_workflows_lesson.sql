-- Seed / rewire GRC "Open-Source Tracking Workflows" tool_walkthrough lesson.
--
-- Depends on the Tier-1 IAM artifact lab: "Evidence Collection & Validation"
-- (control_id = ac-2 — Account Management). Prerequisite is stored as
-- lessons.depends_on_lesson_id (lesson prerequisite FK).
--
-- UI: ToolWalkthroughLesson (screenshot + external reference + reflection).
-- Grading: RAG field-mapping check against the student's own oscal_findings
-- row from the prerequisite lesson — not a generic answer key.
--
-- Idempotent: adds depends_on_lesson_id if missing; upserts the lesson by
-- track + title without deleting sibling GRC lessons.

ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS depends_on_lesson_id uuid
    REFERENCES public.lessons (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS lessons_depends_on_lesson_id_idx
  ON public.lessons (depends_on_lesson_id);

COMMENT ON COLUMN public.lessons.depends_on_lesson_id IS
  'Optional prerequisite lesson. Graders may retrieve the student''s oscal_findings for this lesson when scoring dependent work.';

WITH grc AS (
  SELECT id AS track_id
  FROM public.tracks
  WHERE slug = 'grc'
),
iam_lab AS (
  SELECT l.id
  FROM public.lessons AS l
  CROSS JOIN grc
  WHERE l.track_id = grc.track_id
    AND l.title = 'Evidence Collection & Validation'
  LIMIT 1
)
UPDATE public.lessons AS target
SET
  tier = '1',
  lesson_type = 'tool_walkthrough',
  learning_objectives =
    'Evaluate open-source compliance tracking tools and workflows for maintaining control inventories, evidence repositories, and remediation status. Configure a representative OSS stack to track GRC tasks from control assignment through validation. Map tool fields to your prior IAM lab finding and explain the field mapping in your reflection.',
  dcwf_code = COALESCE(target.dcwf_code, '722'),
  depends_on_lesson_id = iam_lab.id
FROM grc
CROSS JOIN iam_lab
WHERE target.track_id = grc.track_id
  AND target.title = 'Open-Source Tracking Workflows';

INSERT INTO public.lessons (
  track_id,
  tier,
  lesson_type,
  sort_order,
  title,
  learning_objectives,
  dcwf_code,
  depends_on_lesson_id
)
SELECT
  grc.track_id,
  '1',
  'tool_walkthrough',
  COALESCE(
    (
      SELECT MAX(l.sort_order) + 1
      FROM public.lessons AS l
      WHERE l.track_id = grc.track_id
    ),
    4
  ),
  'Open-Source Tracking Workflows',
  'Evaluate open-source compliance tracking tools and workflows for maintaining control inventories, evidence repositories, and remediation status. Configure a representative OSS stack to track GRC tasks from control assignment through validation. Map tool fields to your prior IAM lab finding and explain the field mapping in your reflection.',
  '722',
  iam_lab.id
FROM (
  SELECT id AS track_id
  FROM public.tracks
  WHERE slug = 'grc'
) AS grc
CROSS JOIN (
  SELECT l.id
  FROM public.lessons AS l
  WHERE l.track_id = (SELECT id FROM public.tracks WHERE slug = 'grc')
    AND l.title = 'Evidence Collection & Validation'
  LIMIT 1
) AS iam_lab
WHERE NOT EXISTS (
  SELECT 1
  FROM public.lessons AS existing
  WHERE existing.track_id = grc.track_id
    AND existing.title = 'Open-Source Tracking Workflows'
);

DO $$
DECLARE
  missing_prereq integer;
BEGIN
  SELECT count(*) INTO missing_prereq
  FROM public.lessons AS l
  WHERE l.title = 'Open-Source Tracking Workflows'
    AND l.track_id = (SELECT id FROM public.tracks WHERE slug = 'grc')
    AND l.depends_on_lesson_id IS NULL;

  IF missing_prereq > 0 THEN
    RAISE EXCEPTION
      'Open-Source Tracking Workflows requires prerequisite lesson "Evidence Collection & Validation" on the GRC track';
  END IF;
END $$;
