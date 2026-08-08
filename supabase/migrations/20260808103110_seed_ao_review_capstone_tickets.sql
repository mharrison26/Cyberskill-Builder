-- Seed GRC capstone tickets:
--   GRC-10 authorization_package — compiled SSP + POA&M + OSCAL package view
--   GRC-11 ao_review — Authorizing Official risk-acceptance Q&A (flagship)
--
-- Ticket codes / types (do not match by title):
--   GRC-03 oscal_ssp
--   GRC-04 poam | poam_draft
--   GRC-09 oscal_generator
--   GRC-10 authorization_package
--   GRC-11 ao_review
--
-- Idempotent: deletes prior seed rows by ticket_type + ticketCode marker.

DELETE FROM public.tickets
WHERE tenant_id IN (
    '00000000-0000-4000-8000-000000000001'::uuid,
    '00000000-0000-4000-8000-000000000003'::uuid
  )
  AND track_id = (SELECT id FROM public.tracks WHERE slug = 'grc')
  AND ticket_type IN ('authorization_package', 'ao_review')
  AND (
    initial_state->>'ticketCode' IN ('GRC-10', 'GRC-11')
    OR scenario_brief LIKE 'Authorization package:%'
    OR scenario_brief LIKE 'AO review:%'
  );

-- GRC-10: compiled package
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
  'authorization_package',
  'high',
  60,
  'Authorization package: Compile SSP, POA&M, and OSCAL artifacts for AO review',
  jsonb_build_object(
    'ticketCode', 'GRC-10',
    'sourceArtifacts', jsonb_build_array(
      jsonb_build_object(
        'code', 'GRC-03',
        'ticketTypes', jsonb_build_array('oscal_ssp'),
        'label', 'SSP fragment (OSCAL)'
      ),
      jsonb_build_object(
        'code', 'GRC-04',
        'ticketTypes', jsonb_build_array('poam', 'poam_draft'),
        'label', 'POA&M entries',
        'table', 'poam_items'
      ),
      jsonb_build_object(
        'code', 'GRC-09',
        'ticketTypes', jsonb_build_array('oscal_generator', 'capstone_oscal'),
        'label', 'OSCAL generator artifacts'
      )
    )
  ),
  jsonb_build_object(
    'requireAllSources', true
  ),
  '612',
  90
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

-- GRC-11: AO Q&A (flagship portfolio item on resolve)
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
  'ao_review',
  'high',
  90,
  'AO review: Defend residual risk acceptance for your authorization package',
  jsonb_build_object(
    'ticketCode', 'GRC-11',
    'flagship', true,
    'sourceArtifacts', jsonb_build_array(
      jsonb_build_object(
        'code', 'GRC-03',
        'ticketTypes', jsonb_build_array('oscal_ssp'),
        'label', 'SSP fragment (OSCAL)'
      ),
      jsonb_build_object(
        'code', 'GRC-04',
        'ticketTypes', jsonb_build_array('poam', 'poam_draft'),
        'label', 'POA&M entries',
        'table', 'poam_items'
      ),
      jsonb_build_object(
        'code', 'GRC-09',
        'ticketTypes', jsonb_build_array('oscal_generator', 'capstone_oscal'),
        'label', 'OSCAL generator artifacts'
      )
    )
  ),
  jsonb_build_object(
    'minAnswerLength', 40,
    'questionCountMin', 5,
    'questionCountMax', 7,
    'flagshipOnResolve', true
  ),
  '612',
  95
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
