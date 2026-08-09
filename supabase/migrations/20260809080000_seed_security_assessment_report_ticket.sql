-- Seed GRC-05 Security Assessment Report (SAR) summary ticket.
--
-- Students pull their GRC-03 SSP fragment + GRC-04 POA&M entries (via package
-- compile / portfolio / prior progress), draft a short SAR summary, and must
-- keep the three artifacts internally consistent (POA&M findings referenced
-- in the SAR). Seed embeds sspFragment + poamEntries for admin preview.
--
-- ticket_type: security_assessment_report (alias: sar_summary)
-- Capstone code: GRC-05
--
-- Idempotent: deletes prior seed rows by ticket_type + ticketCode / brief.

DELETE FROM public.tickets
WHERE tenant_id IN (
    '00000000-0000-4000-8000-000000000001'::uuid,
    '00000000-0000-4000-8000-000000000003'::uuid
  )
  AND track_id = (SELECT id FROM public.tracks WHERE slug = 'grc')
  AND ticket_type IN ('security_assessment_report', 'sar_summary')
  AND (
    initial_state->>'ticketCode' = 'GRC-05'
    OR scenario_brief LIKE 'SAR:%'
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
  'security_assessment_report',
  'medium',
  45,
  'SAR: Draft a short Security Assessment Report summary over your SSP and POA&M',
  jsonb_build_object(
    'ticketCode', 'GRC-05',
    'prompt', 'Using your GRC-03 SSP fragment and GRC-04 POA&M entries, draft a short Security Assessment Report summary. Reference each POA&M finding and tie findings to the system described in the SSP.',
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
      )
    ),
    'sspFragment', jsonb_build_object(
      'systemName', 'Training Lab Information System',
      'sspTitle', 'Student SSP fragment — NIST SP 800-171 Rev 3 curated subset',
      'framework', 'nist_sp_800_171_rev3',
      'authorizationBoundary', 'Training lab hosts processing CUI for exercise scenarios.'
    ),
    'poamEntries', jsonb_build_array(
      jsonb_build_object(
        'findingId', 'FIND-AC-2-01',
        'title', 'Account Management',
        'weaknessDescription', 'Privileged accounts lack documented quarterly review evidence. Access certifications are informal and not retained.'
      ),
      jsonb_build_object(
        'findingId', 'FIND-AU-6-01',
        'title', 'Audit Record Review, Analysis, and Reporting',
        'weaknessDescription', 'Security log review is ad hoc with no defined cadence, ownership, or escalation path for anomalous events.'
      ),
      jsonb_build_object(
        'findingId', 'FIND-CM-6-01',
        'title', 'Configuration Settings',
        'weaknessDescription', 'Jump host configuration deviations from the approved baseline are not tracked, and exceptions lack expiration dates.'
      )
    )
  ),
  jsonb_build_object(
    'minSummaryLength', 120,
    'requireSspAlignment', false
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
