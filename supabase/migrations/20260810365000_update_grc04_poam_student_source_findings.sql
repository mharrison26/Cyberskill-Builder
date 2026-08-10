-- GRC-04 POA&M management: pull the student's own two source findings at
-- runtime (IAM lab oscal_findings + L02 lesson_progress), not generic
-- placeholder prior_findings.
--
-- initial_state flags:
--   useStudentSourceFindings = true
--   sourceFindings.iamLessonTitle / l02LessonTitle
-- prior_findings is intentionally empty — the API/UI joins history instead.
--
-- Idempotent: updates existing GRC poam / poam_draft seed rows.

UPDATE public.tickets
SET
  tier = 2,
  ticket_type = 'poam',
  difficulty = 'medium',
  sla_minutes = 45,
  scenario_brief =
    'POA&M: Two findings from your prior work -- the IAM lab''s weak password policy finding, and the AC-2/IA-5 mapping correction from Navigating NIST SP 800-53 -- need formal POA&M entries before the next ConMon review. Draft both entries with realistic remediation milestones.',
  initial_state = jsonb_build_object(
    'ticketCode', 'GRC-04',
    'useStudentSourceFindings', true,
    'sourceFindings', jsonb_build_object(
      'iamLessonTitle', 'Evidence Collection & Validation',
      'l02LessonTitle', 'Navigating NIST SP 800-53'
    ),
    'prior_findings', '[]'::jsonb
  ),
  expected_state = '{}'::jsonb,
  dcwf_code = COALESCE(dcwf_code, '612'),
  sort_order = COALESCE(NULLIF(sort_order, 0), 25)
WHERE track_id = (SELECT id FROM public.tracks WHERE slug = 'grc')
  AND ticket_type IN ('poam', 'poam_draft')
  AND (
    scenario_brief LIKE 'POA&M:%'
    OR (initial_state ? 'prior_findings')
    OR (initial_state->>'ticketCode') = 'GRC-04'
  );

-- Ensure at least one GRC-04 row exists per seeded tenant if none matched.
INSERT INTO public.tickets (
  tenant_id,
  track_id,
  tier,
  ticket_type,
  difficulty,
  sla_minutes,
  scenario_brief,
  initial_state,
  expected_state,
  dcwf_code,
  sort_order
)
SELECT
  st.id,
  grc.track_id,
  2,
  'poam',
  'medium',
  45,
  'POA&M: Two findings from your prior work -- the IAM lab''s weak password policy finding, and the AC-2/IA-5 mapping correction from Navigating NIST SP 800-53 -- need formal POA&M entries before the next ConMon review. Draft both entries with realistic remediation milestones.',
  jsonb_build_object(
    'ticketCode', 'GRC-04',
    'useStudentSourceFindings', true,
    'sourceFindings', jsonb_build_object(
      'iamLessonTitle', 'Evidence Collection & Validation',
      'l02LessonTitle', 'Navigating NIST SP 800-53'
    ),
    'prior_findings', '[]'::jsonb
  ),
  '{}'::jsonb,
  '612',
  25
FROM (
  SELECT id
  FROM public.tenants
  WHERE id IN (
    '00000000-0000-4000-8000-000000000001'::uuid,
    '00000000-0000-4000-8000-000000000003'::uuid
  )
) AS st
CROSS JOIN (
  SELECT id AS track_id FROM public.tracks WHERE slug = 'grc'
) AS grc
WHERE NOT EXISTS (
  SELECT 1
  FROM public.tickets t
  WHERE t.tenant_id = st.id
    AND t.track_id = grc.track_id
    AND t.ticket_type IN ('poam', 'poam_draft')
    AND (
      t.scenario_brief LIKE 'POA&M:%'
      OR (t.initial_state->>'ticketCode') = 'GRC-04'
    )
);
