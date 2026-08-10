-- GRC-03: ensure every oscal_ssp ticket has the Northwind CUI enclave
-- system profile + 03.01.01 / 03.01.02 requirements for the structured form.
-- Also drop incomplete duplicate rows left by lesson-content inserts that
-- omitted requirements / systemDescription.

-- 1) Remove incomplete duplicates (no requirements array).
DELETE FROM public.tickets
WHERE tenant_id IN (
    '00000000-0000-4000-8000-000000000001'::uuid,
    '00000000-0000-4000-8000-000000000003'::uuid
  )
  AND ticket_type IN ('oscal_ssp', 'ssp')
  AND (
    initial_state->>'ticketCode' = 'GRC-03'
    OR initial_state->>'sheetId' = 'GRC-03'
    OR scenario_brief ILIKE '%800-171%'
    OR scenario_brief LIKE 'OSCAL SSP:%'
  )
  AND (
    initial_state->'requirements' IS NULL
    OR jsonb_typeof(initial_state->'requirements') <> 'array'
    OR jsonb_array_length(initial_state->'requirements') = 0
  );

-- 2) Re-apply Northwind form seed + keep lesson-sheet metadata keys.
UPDATE public.tickets
SET
  scenario_brief = $brief$OSCAL SSP: Northwind's DoD subcontract requires a System Security Plan for the enclave handling CUI. Complete the SSP components for two 800-171 Rev 3 requirements related to access control (03.01.01 Account Management and 03.01.02 Access Enforcement), using the provided system description.$brief$,
  initial_state = COALESCE(initial_state, '{}'::jsonb) || $initial${
    "sheetId": "GRC-03",
    "ticketCode": "GRC-03",
    "title": "SSP component writer (800-171 Rev 3)",
    "framework": "nist_sp_800_171_rev3",
    "systemName": "Northwind CUI Enclave",
    "sspTitle": "Northwind CUI Enclave — NIST SP 800-171 Rev 3 SSP fragment (03.01.01, 03.01.02)",
    "systemDescription": "Northwind CUI enclave for the DoD subcontract. Enclave boundary: isolated VPC. User population: 12 engineers, 3 admins. Existing controls: SSO with MFA; quarterly access review.",
    "authorizationBoundary": "Isolated VPC enclave that processes, stores, and transmits CUI for Northwind's DoD subcontract.",
    "prompt": "Northwind's DoD subcontract requires a System Security Plan for the enclave handling CUI. Complete the SSP components for two 800-171 Rev 3 requirements related to access control, using the provided system description.",
    "scenarioBrief": "Northwind's DoD subcontract requires a System Security Plan for the enclave handling CUI. Complete the SSP components for two 800-171 Rev 3 requirements related to access control, using the provided system description.",
    "keyArtifact": "A short fictional system description: enclave boundary (isolated VPC), user population (12 engineers, 3 admins), existing controls (SSO with MFA, quarterly access review).",
    "learningObjective": "Write SSP implementation statements for two related 800-171 Rev 3 access control requirements given a concrete system.",
    "requirements": [
      {
        "id": "03.01.01",
        "oscalControlId": "r03.01.01",
        "family": "Access Control",
        "title": "Account Management",
        "statement": "Define and document the types of system accounts required for the system and manage system accounts, including establishing, activating, modifying, disabling, and removing accounts."
      },
      {
        "id": "03.01.02",
        "oscalControlId": "r03.01.02",
        "family": "Access Control",
        "title": "Access Enforcement",
        "statement": "Enforce approved authorizations for logical access to CUI in accordance with applicable access control policies."
      }
    ]
  }$initial$::jsonb,
  expected_state = COALESCE(expected_state, '{}'::jsonb) || $expected${
    "sheetId": "GRC-03",
    "gradingFocus": "Generated OSCAL SSP fragment validates against schema (deterministic). Implementation narratives are RAG-graded against the live 800-171 Rev 3 requirement text for the two requirements in scope.",
    "learningObjective": "Write SSP implementation statements for two related 800-171 Rev 3 access control requirements given a concrete system."
  }$expected$::jsonb,
  tier = 2,
  difficulty = 'medium',
  sla_minutes = 60,
  dcwf_code = COALESCE(dcwf_code, '612'),
  sort_order = COALESCE(sort_order, 22)
WHERE tenant_id IN (
    '00000000-0000-4000-8000-000000000001'::uuid,
    '00000000-0000-4000-8000-000000000003'::uuid
  )
  AND ticket_type IN ('oscal_ssp', 'ssp')
  AND (
    initial_state->>'ticketCode' = 'GRC-03'
    OR initial_state->>'sheetId' = 'GRC-03'
    OR scenario_brief LIKE 'OSCAL SSP:%'
  );
