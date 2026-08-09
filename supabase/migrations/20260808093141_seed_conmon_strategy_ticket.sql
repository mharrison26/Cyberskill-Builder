-- Seed Tier 3 continuous monitoring strategy ticket (GRC / ISSO-01).
--
-- Students draft a system-level ConMon / ISCM plan for ONE fictional system:
--   - monitoring cadence per control family (ISSO perspective)
--   - DefectDojo / CloudSploit / Scuba → control-family coverage
--   - escalation / reporting cadence
-- Graded via RAG against pinned NIST SP 800-137 guidance text.
-- Deterministic gate: cadences must be risk-appropriate to the system's
-- FIPS 199 impact level (volatile families more frequent on higher impact).
--
-- How to create / customize this ticket content:
--   1. Admin → Tickets → create or edit a ticket with ticket_type = conmon_strategy
--   2. Put the fictional system profile in initial_state.systemProfile
--   3. Set initial_state.ticketCode = 'ISSO-01' and impactLevel (low|moderate|high)
--   4. Optional expected_state knobs:
--        requiredFamilies, requiredTools, minFieldLength, minEscalationLength,
--        guidanceTopics, topKGuidanceSections, impactLevel,
--        skipCadenceAppropriateness
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
  AND t.ticket_type IN ('conmon_strategy', 'continuous_monitoring')
  AND (
    t.scenario_brief LIKE 'ConMon:%'
    OR t.initial_state->>'ticketCode' = 'ISSO-01'
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
  3,
  'conmon_strategy',
  'high',
  90,
  'ConMon: ISSO-01 system-level continuous monitoring plan for HarborNet CMS (FIPS 199 Moderate)',
  jsonb_build_object(
    'ticketCode', 'ISSO-01',
    'impactLevel', 'moderate',
    'systemProfile', jsonb_build_object(
      'name', 'HarborNet Case Management System (CMS)',
      'description', 'Moderate-impact web application used by a regional port authority to track vessel clearances, inspector assignments, and limited PII for credentialed contractors. You are the ISSO for this system only—not the enterprise ISCM program owner.',
      'impact', 'Moderate (FIPS 199)',
      'impactLevel', 'moderate',
      'environment', 'AWS commercial region + Microsoft 365 identity for workforce access; public-facing portal behind a WAF; PostgreSQL and object storage for case artifacts.',
      'dataTypes', jsonb_build_array(
        'Contractor PII',
        'Operational vessel schedules',
        'Inspector notes'
      ),
      'components', jsonb_build_array(
        'React portal',
        'API gateway',
        'ECS services',
        'RDS PostgreSQL',
        'S3 evidence buckets',
        'Entra ID / M365'
      ),
      'constraints', 'Budget favors free/open-source monitoring: DefectDojo for vuln findings, CloudSploit for cloud posture, and CISA Scuba for M365 baseline checks. No enterprise SIEM license yet.',
      'controlFamilies', jsonb_build_array(
        'AC', 'AU', 'CA', 'CM', 'IA', 'RA', 'SC', 'SI'
      )
    ),
    'controlFamilies', jsonb_build_array(
      'AC', 'AU', 'CA', 'CM', 'IA', 'RA', 'SC', 'SI'
    ),
    'tools', jsonb_build_array('DefectDojo', 'CloudSploit', 'Scuba'),
    'prompt', 'As the HarborNet CMS ISSO, write a system-level ISCM plan: set monitoring cadence per control family appropriate to Moderate FIPS 199 impact (tighter for volatile families such as CM/SI/RA), map DefectDojo/CloudSploit/Scuba to the families they cover, and define escalation/reporting cadence for this system.'
  ),
  jsonb_build_object(
    'requiredFamilies', jsonb_build_array(
      'AC', 'AU', 'CA', 'CM', 'IA', 'RA', 'SC', 'SI'
    ),
    'requiredTools', jsonb_build_array('DefectDojo', 'CloudSploit', 'Scuba'),
    'impactLevel', 'moderate',
    'minFieldLength', 40,
    'minEscalationLength', 80,
    'guidanceTopics', jsonb_build_array(
      'define-strategy',
      'system-level-strategy',
      'establish-frequencies',
      'analyze-report'
    ),
    'topKGuidanceSections', 6
  ),
  '612',
  30
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
