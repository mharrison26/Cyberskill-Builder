-- Seed board findings summary ticket (ISSM track).
--
-- Student translates 3–4 technical GRC/ISSO findings into a one-page
-- board-level summary with plain language, business impact, and a clear ask
-- (budget | decision | awareness). Hybrid scoring: deterministic length/ask
-- gates + RAG against data/grc/board-communication-rubric.json.
--
-- ticket_type: board_findings_summary
-- aliases: board_level_summary, technical_to_board_brief
--
-- Idempotent: deletes prior seed rows by ticket_type + ticketCode / scenario marker.

DELETE FROM public.tickets
WHERE tenant_id IN (
    '00000000-0000-4000-8000-000000000001'::uuid, -- commercial
    '00000000-0000-4000-8000-000000000003'::uuid  -- dod_adjacent
  )
  AND track_id = (SELECT id FROM public.tracks WHERE slug = 'issm')
  AND ticket_type IN (
    'board_findings_summary',
    'board_level_summary',
    'technical_to_board_brief'
  )
  AND (
    initial_state->>'ticketCode' = 'ISSM-BOARD-01'
    OR scenario_brief LIKE 'Board findings summary:%'
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
  2,
  'board_findings_summary',
  'medium',
  45,
  'Board findings summary: translate HarborForge ISSO/GRC technical findings into a one-page board brief with plain language, business impact, and a clear ask',
  $initial$
{
  "ticketCode": "ISSM-BOARD-01",
  "prompt": "Translate the technical findings below into a one-page board-level summary. Use plain language, state business impact, and include a clear ask (budget, decision, or awareness).",
  "audience": "Board of Directors / Audit Committee",
  "organization": {
    "name": "HarborForge",
    "context": "Mid-market industrial manufacturer with HarborLedger finance systems, internet-facing commerce APIs, and a production ETL vendor on the data path."
  },
  "pageLimitNote": "Target about one page (350–900 characters).",
  "findings": [
    {
      "id": "f1",
      "technicalTitle": "AC-2 / AC-6 — privileged account review SLA exceeded",
      "technicalDetail": "HarborForge ITGC / ISSO continuous monitoring sampled 22 privileged HarborLedger finance-admin accounts. Quarterly privileged access review (AC-2 account management / AC-6 least privilege) exceeded the 30-calendar-day attestation SLA: 14 accounts lacked manager attestation, and 3 terminated contractors retained elevated roles past HR offboarding. Compensating control: weekly IAM exception report is incomplete for finance OU.",
      "source": "ITGC / ISSO continuous monitoring"
    },
    {
      "id": "f2",
      "technicalTitle": "POA&M HF-2025-014 — patch latency on internet-facing hosts >90 days",
      "technicalDetail": "POA&M HF-2025-014 (open since 2025-11) tracks high-severity CVE remediation on the internet-facing edge/API tier. Patch latency remains >90 days against HarborForge's ConMon patch SLA for internet-facing hosts. Two hosts still expose services associated with CVE-2025-31415 and CVE-2025-28801; milestone slipped twice citing change freeze. Residual risk documented as High pending CAB window.",
      "source": "POA&M register"
    },
    {
      "id": "f3",
      "technicalTitle": "AU-2/AU-6 — incomplete logging on payment API tier",
      "technicalDetail": "Security assessment procedure AU-2 / AU-6 (event logging / audit review) found the payment API tier does not retain authenticated request logs or privileged admin-action trails for the retention period required by HarborForge's logging standard. Fraud investigations for three disputed checkout events could not reconstruct admin overrides. SIEM coverage gap confirmed during ConMon sampling.",
      "source": "Security assessment"
    },
    {
      "id": "f4",
      "technicalTitle": "Vendor SCRM — production ETL vendor with high access criticality, residual high",
      "technicalDetail": "Third-party SCRM review of the production ETL vendor (data pipeline into HarborLedger reporting) rated access criticality High: vendor service account retains broad read/write on staging and production finance extracts. Compensating controls (IP allowlist, quarterly access review) are partially implemented; residual risk remains High. No board-level risk acceptance on file for the current access footprint.",
      "source": "Third-party risk review"
    }
  ],
  "askOptions": ["budget", "decision", "awareness"],
  "minSummaryLength": 350,
  "maxSummaryLength": 900
}
$initial$::jsonb,
  $expected$
{
  "minSummaryLength": 350,
  "maxSummaryLength": 900,
  "requireAskType": true,
  "acceptableAskTypes": ["budget", "decision", "awareness"],
  "guidancePath": "data/grc/board-communication-rubric.json",
  "guidanceTopics": [
    "plain-language",
    "business-impact",
    "clear-ask",
    "avoid-control-dump",
    "finding-coverage"
  ],
  "requiredThemes": ["plain_language", "business_impact", "clear_ask"],
  "topKGuidanceSections": 6
}
$expected$::jsonb,
  '722',
  COALESCE(
    (
      SELECT MAX(tk.sort_order) + 1
      FROM public.tickets AS tk
      WHERE tk.track_id = issm.track_id
        AND tk.tenant_id = st.id
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
    AND existing.ticket_type = 'board_findings_summary'
    AND existing.initial_state->>'ticketCode' = 'ISSM-BOARD-01'
);
