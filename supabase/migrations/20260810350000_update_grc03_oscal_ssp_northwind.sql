-- GRC-03: SSP component writer (800-171 Rev 3)
-- Populate scenario_brief + initial_state from the GRC Lesson Content sheet:
-- Northwind CUI enclave system description and the two Access Control
-- requirement IDs (03.01.01, 03.01.02) already seeded for this ticket.
-- Schema validation before accept remains in oscalSspTicketScorer (unchanged).

UPDATE public.tickets
SET
  scenario_brief = $brief$OSCAL SSP: Northwind's DoD subcontract requires a System Security Plan for the enclave handling CUI. Complete the SSP components for two 800-171 Rev 3 requirements related to access control (03.01.01 Account Management and 03.01.02 Access Enforcement), using the provided system description.$brief$,
  initial_state = $initial${
    "ticketCode": "GRC-03",
    "framework": "nist_sp_800_171_rev3",
    "systemName": "Northwind CUI Enclave",
    "sspTitle": "Northwind CUI Enclave — NIST SP 800-171 Rev 3 SSP fragment (03.01.01, 03.01.02)",
    "systemDescription": "Northwind CUI enclave for the DoD subcontract. Enclave boundary: isolated VPC. User population: 12 engineers, 3 admins. Existing controls: SSO with MFA; quarterly access review.",
    "authorizationBoundary": "Isolated VPC enclave that processes, stores, and transmits CUI for Northwind's DoD subcontract.",
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
  tier = 2,
  difficulty = 'medium',
  sla_minutes = 60,
  dcwf_code = '612'
WHERE tenant_id IN (
    '00000000-0000-4000-8000-000000000001'::uuid,
    '00000000-0000-4000-8000-000000000003'::uuid
  )
  AND ticket_type IN ('oscal_ssp', 'ssp')
  AND (
    initial_state->>'ticketCode' = 'GRC-03'
    OR scenario_brief LIKE 'OSCAL SSP:%'
  );
