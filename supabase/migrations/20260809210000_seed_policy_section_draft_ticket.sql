-- Seed policy section draft ticket (GRC track).
--
-- Students draft ONE policy section (Acceptable Use) given:
--   - a fictional organization profile
--   - a one-paragraph requirement
-- Deterministic: min draft length + required theme keyword coverage.
-- RAG: draft graded against pinned policy-writing rubric
--   (clear scope, enforceable language, defined exceptions process).
--
-- How to create / customize this ticket content:
--   1. Admin → Tickets → create or edit ticket_type = policy_section_draft
--   2. Put org profile + requirement in initial_state
--   3. Put gates in expected_state:
--        minDraftLength, requiredThemes, guidanceTopics,
--        topKGuidanceSections, passThresholdPercent
--
-- Idempotent: NOT EXISTS on track + ticket_type + scenario_brief marker.

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
  'policy_section_draft',
  'medium',
  45,
  'PolicyDraft: Write an Acceptable Use section for Cedarlane Health Analytics',
  jsonb_build_object(
    'ticketCode', 'GRC-POLICY-AUP',
    'prompt', 'Draft the Acceptable Use policy section for Cedarlane Health Analytics. Cover (1) clear scope for people and systems, (2) enforceable must/shall requirements and prohibitions aligned to the requirement below, and (3) a defined exceptions process with approver, request content, and time bound. Write complete policy language—not bullet notes.',
    'organization', jsonb_build_object(
      'name', 'Cedarlane Health Analytics',
      'industry', 'Healthcare analytics SaaS',
      'size', '180 employees; remote-first',
      'systems', jsonb_build_array(
        'Microsoft 365 (email + SharePoint)',
        'Okta SSO',
        'AWS production consoles',
        'Snowflake analytics warehouse',
        'Managed laptops (Jamf/Intune)'
      ),
      'constraints', 'Handles HIPAA-adjacent PHI for hospital customers; small GRC team; contractors regularly access SaaS tools; leadership wants enforceable policy language that auditors can test.'
    ),
    'requirement', 'Workforce members must use company systems only for authorized business purposes related to delivering healthcare analytics, protect credentials and MFA factors, refrain from moving PHI into unsanctioned tools, promptly report suspected phishing or misuse, and obtain documented, time-bound approval before any temporary exception to these rules.',
    'sectionTitle', 'Acceptable Use',
    'sectionId', 'acceptable_use',
    'minDraftLength', 400
  ),
  jsonb_build_object(
    'minDraftLength', 400,
    'requiredThemes', jsonb_build_array(
      'scope',
      'enforceable_language',
      'exceptions_process'
    ),
    'guidanceTopics', jsonb_build_array(
      'clear-scope',
      'enforceable-language',
      'exceptions-process',
      'acceptable-use-themes',
      'draft-completeness'
    ),
    'topKGuidanceSections', 5,
    'passThresholdPercent', 100
  ),
  '612',
  COALESCE(
    (
      SELECT MAX(tk.sort_order) + 1
      FROM public.tickets tk
      WHERE tk.track_id = grc.track_id
    ),
    0
  )
FROM (
  SELECT id
  FROM public.tenants
  WHERE id IN (
    '00000000-0000-4000-8000-000000000001'::uuid, -- commercial
    '00000000-0000-4000-8000-000000000003'::uuid  -- dod_adjacent
  )
) AS st
CROSS JOIN (
  SELECT id AS track_id FROM public.tracks WHERE slug = 'grc'
) AS grc
WHERE NOT EXISTS (
  SELECT 1
  FROM public.tickets AS existing
  WHERE existing.tenant_id = st.id
    AND existing.track_id = grc.track_id
    AND existing.ticket_type IN (
      'policy_section_draft',
      'policy_draft',
      'draft_policy_section'
    )
    AND existing.scenario_brief LIKE 'PolicyDraft: Write an Acceptable Use section for Cedarlane%'
);
