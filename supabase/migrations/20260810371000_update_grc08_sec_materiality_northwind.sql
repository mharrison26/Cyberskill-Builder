-- GRC-08: populate sec_materiality with the Northwind payment-vendor breach
-- scenario from the GRC lesson sheet. Ambiguity is deliberate: vendor breach
-- (not a direct Northwind breach) affecting a subset of customers — materiality
-- is a judgment call graded on factor reasoning, not a forced yes/no answer key.

UPDATE public.tickets AS t
SET
  scenario_brief = $sgrc08$A vendor Northwind uses for payment processing just disclosed a breach that exposed a subset of Northwind's customer records. As the person drafting the initial materiality assessment, determine whether this triggers the SEC's 4-business-day 8-K disclosure requirement and draft the determination memo.$sgrc08$,
  tier = 3,
  difficulty = 'hard',
  sla_minutes = 45,
  dcwf_code = COALESCE(t.dcwf_code, '722'),
  sort_order = 31,
  initial_state = COALESCE(t.initial_state, '{}'::jsonb) || $igrc08${
    "sheetId": "GRC-08",
    "ticketCode": "GRC-08",
    "title": "SEC materiality incident-reporting simulation",
    "prompt": "A vendor Northwind uses for payment processing just disclosed a breach that exposed a subset of Northwind's customer records. As the person drafting the initial materiality assessment, determine whether this triggers the SEC's 4-business-day 8-K disclosure requirement and draft the determination memo.",
    "scenarioBrief": "A vendor Northwind uses for payment processing just disclosed a breach that exposed a subset of Northwind's customer records. As the person drafting the initial materiality assessment, determine whether this triggers the SEC's 4-business-day 8-K disclosure requirement and draft the determination memo.",
    "keyArtifact": "Breach scenario details: systems affected (payment vendor's own systems, not Northwind's), data exposed (names, emails, last-4 card digits), estimated customers impacted (~4,000), vendor's remediation status (contained, forensics ongoing).",
    "learningObjective": "Determine whether a vendor breach triggers the SEC's 8-K materiality disclosure requirement and draft the memo.",
    "companyName": "Northwind Retail Technology",
    "breachScenario": "A vendor Northwind uses for payment processing just disclosed a breach that exposed a subset of Northwind's customer records. As the person drafting the initial materiality assessment, determine whether this triggers the SEC's 4-business-day 8-K disclosure requirement and draft the determination memo.",
    "breach": {
      "company": "Northwind Retail Technology",
      "discoveredAt": "A payment-processing vendor just disclosed a breach",
      "systemsAffected": "payment vendor's own systems, not Northwind's",
      "dataExposed": "names, emails, last-4 card digits",
      "customersImpacted": "~4,000",
      "remediationStatus": "contained, forensics ongoing",
      "businessImpact": "estimated customers impacted (~4,000); vendor's remediation status (contained, forensics ongoing)",
      "scopeNote": "Vendor breach (not a direct Northwind breach); exposed a subset of Northwind's customer records."
    }
  }$igrc08$::jsonb,
  expected_state = COALESCE(t.expected_state, '{}'::jsonb) || $egrc08${
    "sheetId": "GRC-08",
    "learningObjective": "Determine whether a vendor breach triggers the SEC's 8-K materiality disclosure requirement and draft the memo.",
    "gradingFocus": "RAG-graded against the SEC cybersecurity disclosure rule's materiality factors -- does the memo address each factor (financial impact, reputational impact, operational impact, legal/regulatory exposure), not just assert a conclusion.",
    "judgmentCall": true,
    "minFactorLength": 40,
    "minRationaleLength": 60,
    "requiredFactors": [
      "nature_scope",
      "data_compromise",
      "operational_impact",
      "financial_impact",
      "reputational_legal",
      "reasonable_investor"
    ],
    "guidanceTopics": [
      "rule-overview",
      "reasonable-investor",
      "nature-scope",
      "data-compromise",
      "operational-impact",
      "financial-impact",
      "reputational-legal",
      "timing-determination"
    ]
  }$egrc08$::jsonb
FROM public.tracks AS tr
WHERE t.track_id = tr.id
  AND tr.slug = 'grc'
  AND t.ticket_type IN ('sec_materiality', 'sec_cyber_materiality')
  AND t.tenant_id IN (
    '00000000-0000-4000-8000-000000000001'::uuid,
    '00000000-0000-4000-8000-000000000003'::uuid
  );
