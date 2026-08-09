-- Enhance GRC ATO capstone seeds with ISSO curriculum codes + seed package:
--   ISSO-04 (alias GRC-10) authorization_package — compiled ATO package
--   ISSO-05 (alias GRC-11) ao_review — AO residual-risk / POA&M Q&A (flagship)
--
-- ao_review already implements RAG question generation + RAG scoring.
-- This migration:
--   - Retags ticketCode to ISSO-04 / ISSO-05 (keeps ticket_type)
--   - Seeds initial_state.seedPackage so ISSO-05 is playable without prior work
--   - Reaffirms flagship + flagshipOnResolve for portfolio_items.is_flagship
--
-- Idempotent: deletes prior seed rows by ticket_type + ticketCode / scenario marker.

DELETE FROM public.tickets
WHERE tenant_id IN (
    '00000000-0000-4000-8000-000000000001'::uuid,
    '00000000-0000-4000-8000-000000000003'::uuid
  )
  AND track_id = (SELECT id FROM public.tracks WHERE slug = 'grc')
  AND ticket_type IN ('authorization_package', 'ao_review')
  AND (
    initial_state->>'ticketCode' IN ('GRC-10', 'GRC-11', 'ISSO-04', 'ISSO-05')
    OR scenario_brief LIKE 'Authorization package:%'
    OR scenario_brief LIKE 'AO review:%'
    OR scenario_brief LIKE 'ISSO-04:%'
    OR scenario_brief LIKE 'ISSO-05:%'
  );

-- ISSO-04 / GRC-10: compiled ATO package view
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
  'ISSO-04: Compile SSP, POA&M, and OSCAL artifacts into an ATO package for AO review',
  jsonb_build_object(
    'ticketCode', 'ISSO-04',
    'legacyTicketCode', 'GRC-10',
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
    ),
    'seedPackage', jsonb_build_object(
      'artifacts', jsonb_build_array(
        jsonb_build_object(
          'code', 'GRC-03',
          'label', 'SSP fragment (OSCAL)',
          'ticketTypes', jsonb_build_array('oscal_ssp'),
          'status', 'present',
          'summary', 'Sample SSP for Harbor Dental patient portal (Moderate impact).',
          'payload', jsonb_build_object(
            'systemName', 'Harbor Dental Patient Portal',
            'impactLevel', 'Moderate',
            'controlImplementations', jsonb_build_array(
              jsonb_build_object(
                'controlId', 'AC-2',
                'status', 'partial',
                'narrative', 'Account management uses Okta; privileged remote admin path lacks enforced MFA.'
              ),
              jsonb_build_object(
                'controlId', 'AU-2',
                'status', 'implemented',
                'narrative', 'Application and IdP auth events are logged to the SIEM with 90-day retention.'
              )
            )
          ),
          'textCorpus',
          E'## GRC-03 SSP (seed)\nSystem: Harbor Dental Patient Portal\nImpact: Moderate\nAC-2: partial — privileged remote admin lacks MFA\nAU-2: implemented — auth events to SIEM\nResidual concern: privileged remote access without MFA until POA&M closes.'
        ),
        jsonb_build_object(
          'code', 'GRC-04',
          'label', 'POA&M entries',
          'ticketTypes', jsonb_build_array('poam'),
          'status', 'present',
          'summary', '2 seeded POA&M entries (MFA gap + log retention expansion).',
          'payload', jsonb_build_object(
            'poamItems', jsonb_build_array(
              jsonb_build_object(
                'finding_id', 'FIND-AC2-01',
                'weakness_description',
                'Privileged accounts lack MFA on the remote admin path for the patient portal jump host.',
                'milestone', 'Enforce MFA for all privileged remote access; remove shared break-glass until vaulted.',
                'scheduled_completion_date', '2026-09-15',
                'status', 'open',
                'resources', 'IAM engineer + Okta admin (40 hours)'
              ),
              jsonb_build_object(
                'finding_id', 'FIND-AU-EXT-01',
                'weakness_description',
                'Security log retention for VPN concentrator is 30 days; Moderate baseline expects 90 days.',
                'milestone', 'Extend VPN concentrator log shipping to SIEM cold storage for 90 days.',
                'scheduled_completion_date', '2026-10-01',
                'status', 'open',
                'resources', 'Network ops (16 hours)'
              )
            ),
            'entries', jsonb_build_array()
          ),
          'textCorpus',
          E'## GRC-04 POA&M (seed)\nFIND-AC2-01 open — Privileged remote admin MFA missing; due 2026-09-15\nFIND-AU-EXT-01 open — VPN log retention 30d vs 90d; due 2026-10-01\nPOA&M adequacy questions: Are milestones staffed? Are dates credible before authorization?'
        ),
        jsonb_build_object(
          'code', 'GRC-05',
          'label', 'SAR summary (seed excerpt)',
          'ticketTypes', jsonb_build_array('security_assessment_report', 'sar_summary'),
          'status', 'present',
          'summary', 'Seeded SAR excerpt summarizing assessment findings for AO package.',
          'payload', jsonb_build_object(
            'sarSummary',
            'Assessment found AC-2 partially implemented (privileged MFA gap) and AU-family retention shortfall on VPN logs. No critical findings. Residual risk is moderate until MFA enforcement and 90-day VPN log retention complete.'
          ),
          'textCorpus',
          E'## GRC-05 SAR (seed)\nFindings: AC-2 partial (privileged MFA), VPN log retention shortfall.\nNo critical findings. Residual risk moderate pending POA&M closure.'
        ),
        jsonb_build_object(
          'code', 'GRC-09',
          'label', 'OSCAL generator artifacts',
          'ticketTypes', jsonb_build_array('oscal_generator', 'capstone_oscal'),
          'status', 'present',
          'summary', 'Sample OSCAL SSP fragment paths for package consistency checks.',
          'payload', jsonb_build_object(
            'files', jsonb_build_object(
              'output/ssp.json', '{"system-security-plan":{"metadata":{"title":"Harbor Dental Patient Portal"}}}'
            )
          ),
          'textCorpus',
          E'## GRC-09 OSCAL (seed)\noutput/ssp.json — Harbor Dental Patient Portal system-security-plan metadata present.'
        )
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

-- ISSO-05 / GRC-11: AO Q&A (flagship portfolio item on resolve)
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
  'ISSO-05: Defend residual risk acceptance and POA&M adequacy for your ATO package (flagship)',
  jsonb_build_object(
    'ticketCode', 'ISSO-05',
    'legacyTicketCode', 'GRC-11',
    'flagship', true,
    'priorTicketCode', 'ISSO-04',
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
    ),
    'scenario', jsonb_build_object(
      'system', 'Harbor Dental Patient Portal',
      'impactLevel', 'Moderate',
      'audience', 'Authorizing Official',
      'notes',
      'Prefer the student''s live compiled ISSO-04 / GRC-03–09 package. If prior submissions are missing, use seedPackage excerpts so the flagship remains solvable standalone.'
    ),
    'seedPackage', jsonb_build_object(
      'artifacts', jsonb_build_array(
        jsonb_build_object(
          'code', 'GRC-03',
          'label', 'SSP fragment (OSCAL)',
          'ticketTypes', jsonb_build_array('oscal_ssp'),
          'status', 'present',
          'summary', 'Sample SSP for Harbor Dental patient portal (Moderate impact).',
          'payload', jsonb_build_object(
            'systemName', 'Harbor Dental Patient Portal',
            'impactLevel', 'Moderate',
            'controlImplementations', jsonb_build_array(
              jsonb_build_object(
                'controlId', 'AC-2',
                'status', 'partial',
                'narrative', 'Account management uses Okta; privileged remote admin path lacks enforced MFA.'
              ),
              jsonb_build_object(
                'controlId', 'AU-2',
                'status', 'implemented',
                'narrative', 'Application and IdP auth events are logged to the SIEM with 90-day retention.'
              )
            )
          ),
          'textCorpus',
          E'## GRC-03 SSP (seed)\nSystem: Harbor Dental Patient Portal\nImpact: Moderate\nAC-2: partial — privileged remote admin lacks MFA\nAU-2: implemented — auth events to SIEM\nResidual concern: privileged remote access without MFA until POA&M closes.'
        ),
        jsonb_build_object(
          'code', 'GRC-04',
          'label', 'POA&M entries',
          'ticketTypes', jsonb_build_array('poam'),
          'status', 'present',
          'summary', '2 seeded POA&M entries (MFA gap + log retention expansion).',
          'payload', jsonb_build_object(
            'poamItems', jsonb_build_array(
              jsonb_build_object(
                'finding_id', 'FIND-AC2-01',
                'weakness_description',
                'Privileged accounts lack MFA on the remote admin path for the patient portal jump host.',
                'milestone', 'Enforce MFA for all privileged remote access; remove shared break-glass until vaulted.',
                'scheduled_completion_date', '2026-09-15',
                'status', 'open',
                'resources', 'IAM engineer + Okta admin (40 hours)'
              ),
              jsonb_build_object(
                'finding_id', 'FIND-AU-EXT-01',
                'weakness_description',
                'Security log retention for VPN concentrator is 30 days; Moderate baseline expects 90 days.',
                'milestone', 'Extend VPN concentrator log shipping to SIEM cold storage for 90 days.',
                'scheduled_completion_date', '2026-10-01',
                'status', 'open',
                'resources', 'Network ops (16 hours)'
              )
            ),
            'entries', jsonb_build_array()
          ),
          'textCorpus',
          E'## GRC-04 POA&M (seed)\nFIND-AC2-01 open — Privileged remote admin MFA missing; due 2026-09-15\nFIND-AU-EXT-01 open — VPN log retention 30d vs 90d; due 2026-10-01\nPOA&M adequacy questions: Are milestones staffed? Are dates credible before authorization?'
        ),
        jsonb_build_object(
          'code', 'GRC-05',
          'label', 'SAR summary (seed excerpt)',
          'ticketTypes', jsonb_build_array('security_assessment_report', 'sar_summary'),
          'status', 'present',
          'summary', 'Seeded SAR excerpt summarizing assessment findings for AO package.',
          'payload', jsonb_build_object(
            'sarSummary',
            'Assessment found AC-2 partially implemented (privileged MFA gap) and AU-family retention shortfall on VPN logs. No critical findings. Residual risk is moderate until MFA enforcement and 90-day VPN log retention complete.'
          ),
          'textCorpus',
          E'## GRC-05 SAR (seed)\nFindings: AC-2 partial (privileged MFA), VPN log retention shortfall.\nNo critical findings. Residual risk moderate pending POA&M closure.'
        ),
        jsonb_build_object(
          'code', 'GRC-09',
          'label', 'OSCAL generator artifacts',
          'ticketTypes', jsonb_build_array('oscal_generator', 'capstone_oscal'),
          'status', 'present',
          'summary', 'Sample OSCAL SSP fragment paths for package consistency checks.',
          'payload', jsonb_build_object(
            'files', jsonb_build_object(
              'output/ssp.json', '{"system-security-plan":{"metadata":{"title":"Harbor Dental Patient Portal"}}}'
            )
          ),
          'textCorpus',
          E'## GRC-09 OSCAL (seed)\noutput/ssp.json — Harbor Dental Patient Portal system-security-plan metadata present.'
        )
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
