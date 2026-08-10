-- GRC-06 ConMon strategy: pull the student's GRC-03 SSP system description
-- as starting context (Tier 3 continues Tier 2), same continuity pattern as
-- GRC-04 student source findings.
--
-- initial_state flags:
--   useStudentSystemProfile = true
--   sourceSystemProfile.mode = student_grc03
-- systemProfile keeps the Northwind CUI enclave shape matching GRC-03 for
-- impact/family merge + admin preview; runtime prefers the live GRC-03 SSP
-- and does NOT fall back to a fresh HarborNet scenario when the flag is set.
--
-- Idempotent: updates existing GRC conmon_strategy seed rows.

UPDATE public.tickets
SET
  tier = 3,
  ticket_type = 'conmon_strategy',
  difficulty = 'hard',
  sla_minutes = 60,
  scenario_brief =
    'ConMon: Northwind''s DoD subcontract is now active. Using the system description from your GRC-03 SSP, draft the ConMon strategy memo for the CUI enclave: monitoring cadence per control family, which free/open-source tools (DefectDojo, CloudSploit, Scuba) cover which families, and the escalation/reporting cadence to the ISSM.',
  initial_state = jsonb_build_object(
    'sheetId', 'GRC-06',
    'ticketCode', 'GRC-06',
    'title', 'Continuous monitoring (ConMon) strategy',
    'useStudentSystemProfile', true,
    'sourceSystemProfile', jsonb_build_object(
      'mode', 'student_grc03',
      'ticketCode', 'GRC-03'
    ),
    'impactLevel', 'moderate',
    'systemProfile', jsonb_build_object(
      'name', 'Northwind CUI Enclave',
      'description', 'Northwind CUI enclave for the DoD subcontract. Enclave boundary: isolated VPC. User population: 12 engineers, 3 admins. Existing controls: SSO with MFA; quarterly access review.',
      'impact', 'Moderate (FIPS 199)',
      'impactLevel', 'moderate',
      'environment', 'Isolated VPC enclave processing, storing, and transmitting CUI for Northwind''s DoD subcontract; SSO with MFA for workforce access.',
      'authorizationBoundary', 'Isolated VPC enclave that processes, stores, and transmits CUI for Northwind''s DoD subcontract.',
      'dataTypes', jsonb_build_array('Controlled Unclassified Information (CUI)'),
      'components', jsonb_build_array(
        'Isolated VPC',
        'SSO with MFA',
        'Quarterly access review'
      ),
      'constraints', 'Budget favors free/open-source monitoring: DefectDojo, CloudSploit, and CISA Scuba. ConMon continues the system from GRC-03 — not a new scenario.',
      'controlFamilies', jsonb_build_array(
        'AC', 'AU', 'CA', 'CM', 'IA', 'RA', 'SC', 'SI'
      )
    ),
    'controlFamilies', jsonb_build_array(
      'AC', 'AU', 'CA', 'CM', 'IA', 'RA', 'SC', 'SI'
    ),
    'tools', jsonb_build_array('DefectDojo', 'CloudSploit', 'Scuba'),
    'prompt', 'Using the system description from your GRC-03 SSP, draft the ConMon strategy memo for the Northwind CUI enclave: monitoring cadence per control family, which free/open-source tools (DefectDojo, CloudSploit, Scuba) cover which families, and the escalation/reporting cadence to the ISSM.',
    'scenarioBrief', 'Northwind''s DoD subcontract is now active. Using the system description from your GRC-03 SSP, draft the ConMon strategy memo for the CUI enclave: monitoring cadence per control family, which free/open-source tools (DefectDojo, CloudSploit, Scuba) cover which families, and the escalation/reporting cadence to the ISSM.',
    'keyArtifact', 'The system profile from GRC-03, reused for continuity across the track.',
    'learningObjective', 'Draft a risk-appropriate ConMon strategy referencing free/open-source tooling coverage per control family.'
  ),
  expected_state = jsonb_build_object(
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
    'topKGuidanceSections', 6,
    'gradingFocus', 'RAG-graded against SP 800-137 ConMon guidance. Checks cadence is risk-appropriate to the system''s categorization, not a one-size-fits-all schedule.',
    'sheetId', 'GRC-06',
    'learningObjective', 'Draft a risk-appropriate ConMon strategy referencing free/open-source tooling coverage per control family.'
  ),
  dcwf_code = COALESCE(dcwf_code, '723'),
  sort_order = COALESCE(NULLIF(sort_order, 0), 30)
WHERE track_id = (SELECT id FROM public.tracks WHERE slug = 'grc')
  AND ticket_type IN ('conmon_strategy', 'continuous_monitoring')
  AND (
    initial_state->>'ticketCode' IN ('GRC-06', 'ISSO-01')
    OR scenario_brief LIKE 'ConMon:%'
    OR scenario_brief LIKE 'Northwind%ConMon%'
    OR scenario_brief LIKE '%continuous monitoring%'
  );

-- Ensure at least one GRC-06 row exists per seeded tenant if none matched.
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
  'hard',
  60,
  'ConMon: Northwind''s DoD subcontract is now active. Using the system description from your GRC-03 SSP, draft the ConMon strategy memo for the CUI enclave: monitoring cadence per control family, which free/open-source tools (DefectDojo, CloudSploit, Scuba) cover which families, and the escalation/reporting cadence to the ISSM.',
  jsonb_build_object(
    'sheetId', 'GRC-06',
    'ticketCode', 'GRC-06',
    'title', 'Continuous monitoring (ConMon) strategy',
    'useStudentSystemProfile', true,
    'sourceSystemProfile', jsonb_build_object(
      'mode', 'student_grc03',
      'ticketCode', 'GRC-03'
    ),
    'impactLevel', 'moderate',
    'systemProfile', jsonb_build_object(
      'name', 'Northwind CUI Enclave',
      'description', 'Northwind CUI enclave for the DoD subcontract. Enclave boundary: isolated VPC. User population: 12 engineers, 3 admins. Existing controls: SSO with MFA; quarterly access review.',
      'impact', 'Moderate (FIPS 199)',
      'impactLevel', 'moderate',
      'environment', 'Isolated VPC enclave processing, storing, and transmitting CUI for Northwind''s DoD subcontract; SSO with MFA for workforce access.',
      'authorizationBoundary', 'Isolated VPC enclave that processes, stores, and transmits CUI for Northwind''s DoD subcontract.',
      'dataTypes', jsonb_build_array('Controlled Unclassified Information (CUI)'),
      'components', jsonb_build_array(
        'Isolated VPC',
        'SSO with MFA',
        'Quarterly access review'
      ),
      'constraints', 'Budget favors free/open-source monitoring: DefectDojo, CloudSploit, and CISA Scuba. ConMon continues the system from GRC-03 — not a new scenario.',
      'controlFamilies', jsonb_build_array(
        'AC', 'AU', 'CA', 'CM', 'IA', 'RA', 'SC', 'SI'
      )
    ),
    'controlFamilies', jsonb_build_array(
      'AC', 'AU', 'CA', 'CM', 'IA', 'RA', 'SC', 'SI'
    ),
    'tools', jsonb_build_array('DefectDojo', 'CloudSploit', 'Scuba'),
    'prompt', 'Using the system description from your GRC-03 SSP, draft the ConMon strategy memo for the Northwind CUI enclave: monitoring cadence per control family, which free/open-source tools (DefectDojo, CloudSploit, Scuba) cover which families, and the escalation/reporting cadence to the ISSM.',
    'scenarioBrief', 'Northwind''s DoD subcontract is now active. Using the system description from your GRC-03 SSP, draft the ConMon strategy memo for the CUI enclave: monitoring cadence per control family, which free/open-source tools (DefectDojo, CloudSploit, Scuba) cover which families, and the escalation/reporting cadence to the ISSM.',
    'keyArtifact', 'The system profile from GRC-03, reused for continuity across the track.',
    'learningObjective', 'Draft a risk-appropriate ConMon strategy referencing free/open-source tooling coverage per control family.'
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
    'topKGuidanceSections', 6,
    'sheetId', 'GRC-06',
    'learningObjective', 'Draft a risk-appropriate ConMon strategy referencing free/open-source tooling coverage per control family.'
  ),
  '723',
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
) AS grc
WHERE NOT EXISTS (
  SELECT 1
  FROM public.tickets t
  WHERE t.tenant_id = st.id
    AND t.track_id = grc.track_id
    AND t.ticket_type IN ('conmon_strategy', 'continuous_monitoring')
    AND (
      (t.initial_state->>'ticketCode') = 'GRC-06'
      OR t.scenario_brief LIKE 'ConMon:%'
    )
);
