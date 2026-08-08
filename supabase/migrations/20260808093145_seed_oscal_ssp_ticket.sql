-- Seed OSCAL SSP structured-form ticket (GRC track).
--
-- Students complete implementation status / responsible role / narrative for a
-- curated NIST SP 800-171 Rev 3 requirement subset. The scorer compiles answers
-- into a minimal OSCAL SSP JSON document and validates it against the vendored
-- NIST OSCAL SSP JSON Schema (data/oscal/oscal_ssp_schema.json).
--
-- ticket_type: oscal_ssp (admin alias: ssp)
-- Capstone code: GRC-03
--
-- Idempotent: deletes prior seed rows by stable scenario_brief marker per tenant.

DELETE FROM public.tickets
WHERE tenant_id IN (
    '00000000-0000-4000-8000-000000000001'::uuid,
    '00000000-0000-4000-8000-000000000003'::uuid
  )
  AND track_id = (SELECT id FROM public.tracks WHERE slug = 'grc')
  AND ticket_type IN ('oscal_ssp', 'ssp')
  AND scenario_brief LIKE 'OSCAL SSP:%';

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
  'oscal_ssp',
  'medium',
  60,
  'OSCAL SSP: Document NIST SP 800-171 Rev 3 implementations for the lab system',
  jsonb_build_object(
    'ticketCode', 'GRC-03',
    'framework', 'nist_sp_800_171_rev3',
    'systemName', 'Training Lab Information System',
    'sspTitle', 'Student SSP fragment — NIST SP 800-171 Rev 3 curated subset',
    'requirements', jsonb_build_array(
      jsonb_build_object(
        'id', '03.01.01',
        'oscalControlId', 'r03.01.01',
        'family', 'Access Control',
        'title', 'Account Management',
        'statement', 'Define and document the types of system accounts required for the system and manage system accounts, including establishing, activating, modifying, disabling, and removing accounts.'
      ),
      jsonb_build_object(
        'id', '03.01.02',
        'oscalControlId', 'r03.01.02',
        'family', 'Access Control',
        'title', 'Access Enforcement',
        'statement', 'Enforce approved authorizations for logical access to CUI in accordance with applicable access control policies.'
      ),
      jsonb_build_object(
        'id', '03.05.01',
        'oscalControlId', 'r03.05.01',
        'family', 'Identification and Authentication',
        'title', 'User Identification and Authentication',
        'statement', 'Uniquely identify and authenticate system users and associate that unique identification with processes acting on behalf of those users.'
      ),
      jsonb_build_object(
        'id', '03.11.01',
        'oscalControlId', 'r03.11.01',
        'family', 'Risk Assessment',
        'title', 'Risk Assessment',
        'statement', 'Periodically assess the risk to organizational operations, organizational assets, and individuals resulting from the operation of the system and the processing, storage, or transmission of CUI.'
      ),
      jsonb_build_object(
        'id', '03.14.01',
        'oscalControlId', 'r03.14.01',
        'family', 'System and Information Integrity',
        'title', 'Flaw Remediation',
        'statement', 'Identify, report, and correct system flaws in a timely manner and install security-relevant software and firmware updates.'
      )
    )
  ),
  '{}'::jsonb,
  '612',
  22
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
