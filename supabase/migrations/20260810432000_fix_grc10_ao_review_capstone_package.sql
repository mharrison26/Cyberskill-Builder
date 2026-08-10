-- GRC-10 RMF package defense (ao_review): ensure compile sources + flagship metadata.
-- Sheet curriculum maps GRC-10 → ticket_type ao_review (compiled GRC-03/04/09 + AO Q&A).
-- ISSO two-step remains authorization_package (ISSO-04) → ao_review (ISSO-05) on isso track.
-- Runtime already defaults sourceArtifacts; this reaffirms seedPackage + flagshipOnResolve.

UPDATE public.tickets AS t
SET
  initial_state = COALESCE(t.initial_state, '{}'::jsonb) || jsonb_build_object(
    'sheetId', 'GRC-10',
    'ticketCode', 'GRC-10',
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
    ),
    'seedPackage', jsonb_build_object(
      'artifacts', jsonb_build_array(
        jsonb_build_object(
          'code', 'GRC-03',
          'label', 'SSP fragment (OSCAL)',
          'ticketTypes', jsonb_build_array('oscal_ssp'),
          'status', 'present',
          'summary', 'Sample SSP for Northwind CUI Enclave (Moderate impact).',
          'payload', jsonb_build_object(
            'systemName', 'Northwind CUI Enclave',
            'impactLevel', 'Moderate',
            'controlImplementations', jsonb_build_array(
              jsonb_build_object(
                'controlId', 'AC-2',
                'status', 'implemented',
                'narrative',
                'Accounts are provisioned through the corporate SSO IdP with MFA required for all privileged roles.'
              ),
              jsonb_build_object(
                'controlId', 'IA-5',
                'status', 'partial',
                'narrative',
                'Password complexity and rotation are enforced via the IdP. Hardware authenticator rollout for administrators is scheduled.'
              )
            )
          ),
          'textCorpus',
          E'## GRC-03 SSP (seed)\nSystem: Northwind CUI Enclave\nImpact: Moderate\nAC-2: implemented — SSO IdP with MFA for privileged roles\nIA-5: partial — hardware authenticator rollout pending for admins\nResidual concern: admin authenticator gap until POA&M closes.'
        ),
        jsonb_build_object(
          'code', 'GRC-04',
          'label', 'POA&M entries',
          'ticketTypes', jsonb_build_array('poam'),
          'status', 'present',
          'summary', '2 seeded POA&M entries (admin authenticator + access-review evidence gap).',
          'payload', jsonb_build_object(
            'poamItems', jsonb_build_array(
              jsonb_build_object(
                'finding_id', 'FIND-IA5-01',
                'weakness_description',
                'Administrator accounts rely on phishing-resistant MFA software tokens; hardware authenticator rollout is incomplete for the CUI enclave jump path.',
                'milestone',
                'Complete hardware authenticator enrollment for all enclave administrators; remove interim software-token exception.',
                'scheduled_completion_date', '2026-09-30',
                'status', 'open',
                'resources', 'IAM engineer (24 hours)'
              ),
              jsonb_build_object(
                'finding_id', 'FIND-AC2-QR-01',
                'weakness_description',
                'Quarterly access review exists, but evidence of manager attestation for contractor accounts is incomplete.',
                'milestone',
                'Capture signed manager attestations for contractor enclave accounts and store in the ConMon evidence folder.',
                'scheduled_completion_date', '2026-10-15',
                'status', 'open',
                'resources', 'ISSO + hiring managers (12 hours)'
              )
            ),
            'entries', jsonb_build_array()
          ),
          'textCorpus',
          E'## GRC-04 POA&M (seed)\nFIND-IA5-01 open — Admin hardware authenticator rollout incomplete; due 2026-09-30\nFIND-AC2-QR-01 open — Contractor access-review attestation gap; due 2026-10-15\nPOA&M adequacy: Are milestones staffed? Are dates credible before authorization?'
        ),
        jsonb_build_object(
          'code', 'GRC-09',
          'label', 'OSCAL generator artifacts',
          'ticketTypes', jsonb_build_array('oscal_generator', 'capstone_oscal'),
          'status', 'present',
          'summary', 'Sample OSCAL SSP fragment for Northwind CUI Enclave package consistency checks.',
          'payload', jsonb_build_object(
            'files', jsonb_build_object(
              'output/ssp.json',
              '{"system-security-plan":{"metadata":{"title":"Northwind CUI Enclave"}}}'
            )
          ),
          'textCorpus',
          E'## GRC-09 OSCAL (seed)\noutput/ssp.json — Northwind CUI Enclave system-security-plan metadata present.'
        )
      )
    )
  ),
  expected_state = COALESCE(t.expected_state, '{}'::jsonb) || jsonb_build_object(
    'sheetId', 'GRC-10',
    'minAnswerLength', 40,
    'questionCountMin', 5,
    'questionCountMax', 7,
    'flagshipOnResolve', true,
    'learningObjective',
    'Compile the track''s artifacts into one package and defend residual-risk decisions to a simulated Authorizing Official.'
  )
FROM public.tracks AS tr
WHERE t.track_id = tr.id
  AND tr.slug = 'grc'
  AND t.ticket_type = 'ao_review'
  AND t.tenant_id IN (
    '00000000-0000-4000-8000-000000000001'::uuid,
    '00000000-0000-4000-8000-000000000003'::uuid
  )
  AND (
    t.initial_state->>'ticketCode' = 'GRC-10'
    OR t.initial_state->>'sheetId' = 'GRC-10'
    OR COALESCE(t.initial_state->>'ticketCode', '') = ''
  );

-- GRC sheet uses ao_review as GRC-10; remove any stray authorization_package
-- rows still labeled GRC-10 on the grc track (legacy two-step seed).
DELETE FROM public.tickets
WHERE tenant_id IN (
    '00000000-0000-4000-8000-000000000001'::uuid,
    '00000000-0000-4000-8000-000000000003'::uuid
  )
  AND track_id = (SELECT id FROM public.tracks WHERE slug = 'grc')
  AND ticket_type = 'authorization_package'
  AND (
    initial_state->>'ticketCode' IN ('GRC-10', 'GRC-11')
    OR initial_state->>'sheetId' = 'GRC-10'
  );
