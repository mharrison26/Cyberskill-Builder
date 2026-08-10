-- Seed ISSM-07 one-year security strategy capstone (track flagship portfolio item).
--
-- Students receive organization risk profile, FY budget constraints, and prior
-- findings, then draft a one-year strategy memo (ranked priorities, resourcing,
-- measurable outcomes). Hybrid scoring: deterministic completeness + RAG against
-- data/grc/security-strategy-planning-rubric.json.
-- On resolve, submit marks portfolio_items.is_flagship for the ISSM track
-- (isFlagshipEligibleTicketType includes security_strategy_capstone).
--
-- ticket_type: security_strategy_capstone
-- aliases: one_year_security_strategy, issm_strategy_memo_capstone
--
-- Idempotent: deletes prior seed rows by ticket_type + ticketCode / scenario marker.

DELETE FROM public.tickets
WHERE tenant_id IN (
    '00000000-0000-4000-8000-000000000001'::uuid, -- commercial
    '00000000-0000-4000-8000-000000000003'::uuid  -- dod_adjacent
  )
  AND track_id = (SELECT id FROM public.tracks WHERE slug = 'issm')
  AND ticket_type IN (
    'security_strategy_capstone',
    'one_year_security_strategy',
    'issm_strategy_memo_capstone'
  )
  AND (
    initial_state->>'ticketCode' = 'ISSM-07'
    OR scenario_brief LIKE 'ISSM-07:%'
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
  issm.track_id,
  3,
  'security_strategy_capstone',
  'high',
  120,
  'ISSM-07: Draft a one-year security strategy memo for HarborLedger under budget and finding constraints (flagship portfolio)',
  $initial$
{
  "ticketCode": "ISSM-07",
  "flagship": true,
  "flagshipPortfolio": true,
  "prompt": "Draft a one-year security strategy memo for leadership covering top priorities, resourcing under the budget envelope, and expected outcomes. Use the organization risk profile, budget constraints, and prior findings provided — do not invent a different scenario.",
  "organization": {
    "name": "HarborLedger Financial Reporting",
    "mission": "Produce timely, accurate municipal port financial reporting and grant drawdowns for Harbor Authority leadership and external auditors.",
    "size": "~420 employees; 3 High-impact systems in the authorization boundary"
  },
  "riskProfile": {
    "overall": "high",
    "threatContext": "Peer port authority ransomware incident targeted privileged finance admins; phishing against Entra ID remains elevated. Insider misuse of grant-drawdown roles is a secondary concern.",
    "topRisks": [
      {
        "id": "r1",
        "title": "Privileged MFA gaps on HarborLedger finance-admin paths",
        "severity": "high"
      },
      {
        "id": "r2",
        "title": "Aging High POA&Ms (>90 days) on finance and identity systems",
        "severity": "high"
      },
      {
        "id": "r3",
        "title": "Incomplete ConMon / vuln aggregation for High-impact apps",
        "severity": "high"
      },
      {
        "id": "r4",
        "title": "Stale annual assessment evidence for HarborLedger",
        "severity": "moderate"
      }
    ]
  },
  "budget": {
    "fiscalYear": "FY2027",
    "totalBudget": 400000,
    "constraints": [
      "Hard ceiling $400,000 — no mid-year uplift expected",
      "No new permanent headcount until Q3; contractor surge allowed",
      "Must not cut the mandatory annual assessment contract"
    ],
    "mustFund": [
      "Annual independent assessment / security control assessment contract (~$90,000)",
      "Existing SIEM seat renewals (~$45,000)"
    ]
  },
  "priorFindings": [
    {
      "id": "f1",
      "title": "Phishing-resistant MFA not enforced for privileged HarborLedger roles",
      "severity": "high",
      "source": "OA",
      "status": "open"
    },
    {
      "id": "f2",
      "title": "POA&M-HL-014 and related High items aging past 90 days without named owners",
      "severity": "high",
      "source": "ConMon / ISSM quality review",
      "status": "open"
    },
    {
      "id": "f3",
      "title": "Vulnerability findings not consistently ingested into enterprise tracker for High systems",
      "severity": "moderate",
      "source": "Internal audit ITGC",
      "status": "open"
    },
    {
      "id": "f4",
      "title": "Security awareness completion below 85% in finance org unit",
      "severity": "low",
      "source": "Workforce metrics",
      "status": "open"
    }
  ],
  "minMemoLength": 600,
  "minSectionLength": 120,
  "minPriorities": 3,
  "minOutcomes": 3,
  "requiredSections": ["priorities", "resourcing", "expected_outcomes"]
}
$initial$::jsonb,
  $expected$
{
  "minMemoLength": 600,
  "minSectionLength": 120,
  "minPriorities": 3,
  "minOutcomes": 3,
  "requiredSectionKeys": ["priorities", "resourcing", "expected_outcomes"],
  "guidanceTopics": [
    "strategic planning",
    "risk-based prioritization",
    "security program strategy",
    "resourcing",
    "outcomes"
  ],
  "topKGuidanceSections": 6,
  "flagship": true,
  "flagshipOnResolve": true,
  "flagshipPortfolio": true,
  "passThreshold": "satisfied"
}
$expected$::jsonb,
  '722',
  COALESCE(
    (
      SELECT MAX(tk.sort_order) + 1
      FROM public.tickets tk
      WHERE tk.track_id = issm.track_id
    ),
    0
  )
FROM (
  SELECT id
  FROM public.tenants
  WHERE id IN (
    '00000000-0000-4000-8000-000000000001'::uuid,
    '00000000-0000-4000-8000-000000000003'::uuid
  )
) AS st
CROSS JOIN (
  SELECT id AS track_id FROM public.tracks WHERE slug = 'issm'
) AS issm
WHERE NOT EXISTS (
  SELECT 1
  FROM public.tickets AS existing
  WHERE existing.tenant_id = st.id
    AND existing.track_id = issm.track_id
    AND existing.ticket_type = 'security_strategy_capstone'
    AND (
      existing.initial_state->>'ticketCode' = 'ISSM-07'
      OR existing.scenario_brief LIKE 'ISSM-07:%'
    )
);
