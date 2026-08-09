-- Seed Tier 2 continuous auditing design ticket (GRC track).
--
-- Students design a continuous auditing approach for one control area:
--   - control area (fixed by scenario: timely access revocation)
--   - frequency (e.g. daily / weekly / monthly)
--   - data source
--   - exception-handling process
-- Optional: automation method, owners, escalation, false-positive handling.
-- Deterministic completeness scoring + RAG grading against pinned guidance
-- (data/grc/continuous-auditing-guidance.json).
--
-- Distinct from conmon_strategy (full ISCM / SP 800-137 strategy memo).
--
-- How to create / customize this ticket content:
--   1. Admin → Tickets → create or edit a ticket with ticket_type = continuous_auditing
--      (alias: continuous_audit_design)
--   2. Put org / control-area scenario in initial_state.scenario
--   3. Put fixed control area in initial_state.controlArea
--   4. Optional expected_state knobs:
--        minFieldLength, minExceptionLength, guidanceTopics,
--        topKGuidanceSections, controlArea (override)
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
  AND t.ticket_type IN ('continuous_auditing', 'continuous_audit_design')
  AND (
    t.scenario_brief LIKE 'ContinuousAuditing:%'
    OR t.initial_state->>'ticketCode' = 'CA-01'
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
  'continuous_auditing',
  'medium',
  45,
  'ContinuousAuditing: Design monthly exception reporting for timely access revocation',
  jsonb_build_object(
    'ticketCode', 'CA-01',
    'controlId', 'AC-2',
    'controlTitle', 'Account Management — timely access revocation',
    'controlArea', 'Timely access revocation',
    'allowControlAreaSelect', false,
    'scenario', jsonb_build_object(
      'organization', 'North Pier Logistics — a 220-employee regional freight broker. Workforce identity is Okta; HR terminations are recorded in BambooHR.',
      'controlArea', 'Timely access revocation (terminated / transferred users disabled within 24 hours of the HR effective date).',
      'currentTest', 'Once per year, Internal Audit selects a haphazard sample of 25 terminations and manually compares BambooHR effective dates to Okta disable timestamps. Findings are often delivered months after the period under test.',
      'painPoints', jsonb_build_array(
        'Annual sample covers a small fraction of terminations',
        'Delayed detection of late disables and orphaned privileged accounts',
        'Manual evidence collection consumes audit and IAM capacity',
        'No standing exception queue between annual tests'
      ),
      'availableData', jsonb_build_array(
        'BambooHR termination / transfer exports (effective date, manager, employee type)',
        'Okta user status and last-updated / disable timestamps via API or scheduled export',
        'Jira IAM tickets for manual disablements and access exceptions'
      ),
      'constraints', 'Budget favors a scheduled join/report over a full SIEM license. Continuous auditing should replace the annual manual sample for this control area with more frequent exception reporting, not a full enterprise ConMon strategy.',
      'notes', 'Design continuous auditing for this one control area: state frequency, name concrete data sources, and define how exceptions are triaged, investigated, remediated, and closed.'
    ),
    'prompt', 'Design a continuous auditing approach for timely access revocation that improves on the annual manual sample. Specify frequency, data source(s), and the exception-handling process. Optional fields (automation, owners, escalation, false-positive handling) strengthen the design. Completeness is scored deterministically; design quality is graded against pinned continuous auditing guidance.'
  ),
  jsonb_build_object(
    'minFieldLength', 40,
    'minExceptionLength', 80,
    'guidanceTopics', jsonb_build_array(
      'frequency-design',
      'data-source-design',
      'exception-handling',
      'design-completeness',
      'vs-annual-manual-testing'
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
