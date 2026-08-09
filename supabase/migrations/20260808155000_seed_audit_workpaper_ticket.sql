-- Seed Tier 2 structured audit workpaper ticket (GRC track).
--
-- Students complete a control-test workpaper with:
--   - objective
--   - procedure performed
--   - evidence obtained
--   - conclusion
--   - preparer
--   - reviewer
-- Deterministic completeness scoring + RAG grading of conclusion quality
-- against the stated test objective using pinned guidance
-- (data/grc/audit-workpaper-guidance.json).
--
-- How to create / customize this ticket content:
--   1. Admin → Tickets → create or edit a ticket with ticket_type = audit_workpaper
--      (alias: workpaper)
--   2. Put the stated test objective in initial_state.testObjective
--   3. Put scenario narrative fields in initial_state.scenario
--   4. Optional expected_state knobs:
--        minFieldLength, minIdentityLength, minConclusionLength,
--        guidanceTopics, topKGuidanceSections, testObjective (override)
--
-- Idempotent: deletes prior seed rows by stable scenario_brief / ticketCode marker.

-- ---------------------------------------------------------------------------
-- Commercial + DoD-adjacent tenants (stable UUIDs from 0002 / 0020)
-- ---------------------------------------------------------------------------

WITH seed_tenants AS (
  SELECT id
  FROM public.tenants
  WHERE id IN (
    '00000000-0000-4000-8000-000000000001'::uuid, -- commercial
    '00000000-0000-4000-8000-000000000003'::uuid  -- dod_adjacent
  )
),
grc AS (
  SELECT id AS track_id FROM public.tracks WHERE slug = 'grc'
)
DELETE FROM public.tickets t
USING seed_tenants st, grc
WHERE t.tenant_id = st.id
  AND t.track_id = grc.track_id
  AND t.ticket_type IN ('audit_workpaper', 'workpaper')
  AND (
    t.scenario_brief LIKE 'Workpaper:%'
    OR t.initial_state->>'ticketCode' = 'WP-01'
  );

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
  'audit_workpaper',
  'medium',
  45,
  'Workpaper: Document termination account-disablement testing for AC-2',
  jsonb_build_object(
    'ticketCode', 'WP-01',
    'controlId', 'AC-2',
    'controlTitle', 'Account Management',
    'testObjective', 'Determine whether terminated user accounts are disabled or removed within 24 hours of the HR termination effective date.',
    'scenario', jsonb_build_object(
      'organization', 'North Pier Logistics — a 220-employee regional freight broker with hybrid workforce access via Okta and HR records in BambooHR.',
      'system', 'Okta workforce IAM (source of account status) integrated with BambooHR terminations.',
      'policy', 'IT Access Termination SOP requires IAM to disable or remove accounts within 24 hours of the HR termination effective date.',
      'population', 'All workforce terminations with an HR effective date between 2026-04-01 and 2026-06-30 (47 terminations).',
      'sample', 'Engagement lead selected a haphazard sample of 15 terminations covering both offices and contractor vs employee roles.',
      'period', 'Q2 2026 (2026-04-01 through 2026-06-30).',
      'availableEvidence', jsonb_build_array(
        'BambooHR termination export (CSV) for Q2',
        'Okta user export with status and last-updated timestamps',
        'Jira tickets for manual disablement exceptions'
      ),
      'notes', 'Three sample items appear delayed in a preliminary glance at Okta timestamps; document procedures, evidence, and a conclusion that answers the stated test objective.'
    ),
    'prompt', 'Complete the structured workpaper for this AC-2 termination disablement test. Restate the objective, document procedures and evidence, identify preparer/reviewer, and write a conclusion that answers the stated test objective. Completeness is scored deterministically; conclusion quality is graded against the stated objective using pinned workpaper guidance.'
  ),
  jsonb_build_object(
    'minFieldLength', 40,
    'minIdentityLength', 2,
    'minConclusionLength', 60,
    'guidanceTopics', jsonb_build_array(
      'stated-objective',
      'procedure-performed',
      'evidence-obtained',
      'conclusion-quality',
      'objective-alignment'
    ),
    'topKGuidanceSections', 5
  ),
  '612',
  COALESCE(
    (
      SELECT MAX(tk.sort_order) + 1
      FROM public.tickets AS tk
      WHERE tk.track_id = grc.track_id
        AND tk.tenant_id = st.id
    ),
    0
  )
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
