-- Seed POA&M drafting ticket (GRC track).
--
-- Students receive 3 prior findings in initial_state.prior_findings and must
-- draft a POA&M entry for each (weakness, milestone, scheduled date, status).
-- Completeness is scored deterministically; remediation quality feedback uses
-- RAG against pinned POA&M guidance (data/nist/poam-remediation-guidance.json).
--
-- How to create / customize:
--   1. Admin → Tickets → ticket_type = poam (alias: poam_draft)
--   2. Put 2–3 findings in initial_state.prior_findings:
--        [{ id, control_id?, title?, summary, finding_state? }, ...]
--   3. Students submit { entries: [{ findingId, weaknessDescription, milestone,
--        scheduledCompletionDate, status }, ...] }
--
-- Idempotent: deletes prior seed rows by stable scenario_brief marker per tenant.

DELETE FROM public.tickets
WHERE tenant_id IN (
    '00000000-0000-4000-8000-000000000001'::uuid,
    '00000000-0000-4000-8000-000000000003'::uuid
  )
  AND track_id = (SELECT id FROM public.tracks WHERE slug = 'grc')
  AND ticket_type IN ('poam', 'poam_draft')
  AND scenario_brief LIKE 'POA&M:%';

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
  'POA&M: Draft remediation plans for three prior assessment findings',
  jsonb_build_object(
    'prior_findings', jsonb_build_array(
      jsonb_build_object(
        'id', 'FIND-AC-2-01',
        'control_id', 'ac-2',
        'title', 'Account Management',
        'finding_state', 'not_satisfied',
        'summary', 'Privileged accounts lack documented quarterly review evidence. Access certifications are informal and not retained.'
      ),
      jsonb_build_object(
        'id', 'FIND-AU-6-01',
        'control_id', 'au-6',
        'title', 'Audit Record Review, Analysis, and Reporting',
        'finding_state', 'not_satisfied',
        'summary', 'Security log review is ad hoc with no defined cadence, ownership, or escalation path for anomalous events.'
      ),
      jsonb_build_object(
        'id', 'FIND-CM-6-01',
        'control_id', 'cm-6',
        'title', 'Configuration Settings',
        'finding_state', 'insufficient_evidence',
        'summary', 'Jump host configuration deviations from the approved baseline are not tracked, and exceptions lack expiration dates.'
      )
    )
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
) AS grc;
