-- Seed a Tier 2 sec_materiality ticket on the GRC track (commercial tenant).
-- Students draft a Form 8-K Item 1.05 materiality memo for a fictional breach;
-- scored with deterministic factor coverage + RAG against data/sec guidance.

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
  '00000000-0000-4000-8000-000000000001'::uuid,
  t.id,
  2,
  'sec_materiality',
  'high',
  60,
  $brief$
Northline Analytics, Inc. (fictional NYSE issuer) discovered a ransomware intrusion on Day 0. Attackers encrypted the production order-entry and billing cluster for ~36 hours and exfiltrated a database export containing ~180,000 customer records (name, email, phone, country, password hashes). Finance systems and SEC reporting tooling were not encrypted. Containment completed Day 1; restoration of order entry completed Day 2 with a backlog. Preliminary estimates: $1.8–$3.2M investigation/remediation, ~$0.9M deferred revenue from the outage, and likely state AG notification plus consumer litigation risk. IR asks GRC for a materiality determination memo consistent with the SEC cybersecurity disclosure rule (Form 8-K Item 1.05 four-business-day trigger). Educational exercise only — not legal advice.
$brief$,
  '{
    "breach": {
      "company": "Northline Analytics, Inc. (fictional public company)",
      "discoveredAt": "Day 0 — SOC detected ransomware in production order-entry",
      "systemsAffected": "Production order-entry and billing cluster encrypted (~36 hours). Identity provider briefly abused for lateral movement. Finance ERP and disclosure/reporting systems were not encrypted and remained available.",
      "dataExposed": "Export of ~180,000 customer records: name, email, phone, country, password hashes. No payment card PAN or SSN confirmed in the exfiltrated set. Internal source code repos not known to be taken.",
      "businessImpact": "Online order intake halted during outage; backlog cleared by Day 3. Estimated $1.8–$3.2M response costs and ~$0.9M deferred revenue. Customer notifications planned; early plaintiff counsel inquiries expected. Brand/reputation risk among enterprise buyers."
    },
    "prompt": "Draft a materiality determination memo covering each SEC cybersecurity disclosure materiality factor and state whether Item 1.05''s four-business-day clock has started."
  }'::jsonb,
  '{
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
  }'::jsonb,
  '612',
  COALESCE(
    (
      SELECT MAX(tk.sort_order) + 1
      FROM public.tickets AS tk
      WHERE tk.track_id = t.id
    ),
    0
  )
FROM public.tracks AS t
WHERE t.slug = 'grc'
  AND NOT EXISTS (
    SELECT 1
    FROM public.tickets AS existing
    WHERE existing.track_id = t.id
      AND existing.ticket_type = 'sec_materiality'
      AND existing.scenario_brief LIKE 'Northline Analytics, Inc.%'
  );
