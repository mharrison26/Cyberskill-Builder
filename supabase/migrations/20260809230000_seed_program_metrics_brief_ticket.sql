-- Seed Tier 2 leadership program-metrics brief ticket (GRC track / ISSO program oversight).
--
-- Students receive raw program data (POA&M aging, training completion, incidents),
-- select 2–3 leadership-meaningful metrics, calculate them, and explain why.
-- Deterministic: selection count, rationale length, calculation tolerances.
-- RAG: metric selection + rationale graded against pinned
-- data/grc/program-metrics-rubric.json.
--
-- Distinct from kpi_report (helpdesk ticket-resolution CSV KPIs).
--
-- Expected arithmetic (document for graders / admins):
--   total POA&Ms = 12 + 8 + 5 + 7 = 32
--   poam_overdue_rate = 7 / 32 = 0.21875
--   training_completion_rate = 420 / 500 = 0.84
--   high_severity_incident_share = (1 + 3) / 14 ≈ 0.2857142857
--
-- Idempotent: INSERT … WHERE NOT EXISTS by ticketCode / scenario_brief marker.

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
  'program_metrics_brief',
  'medium',
  45,
  'ProgramMetrics: Select leadership KPIs from HarborLedger FY2026 Q2 program data',
  $initial${
  "ticketCode": "ISSO-PM-01",
  "prompt": "Select and calculate 2–3 metrics meaningful to leadership from the raw program data. Explain why each was chosen for AO / ISSM oversight — not vanity activity counts.",
  "organization": {
    "name": "HarborForge Federal Services",
    "system": "HarborLedger Financial Reporting (ATO High)"
  },
  "reportingPeriod": "FY2026 Q2",
  "rawData": {
    "poamByAge": { "0_30": 12, "31_60": 8, "61_90": 5, "over_90": 7 },
    "training": { "completed": 420, "required": 500 },
    "incidents": { "total": 14, "p1": 1, "p2": 3, "p3": 10 }
  },
  "candidateMetrics": [
    {
      "id": "poam_overdue_rate",
      "label": "POA&M overdue (>90 days) rate",
      "formulaHint": "over_90 / total_poams  →  7 / 32"
    },
    {
      "id": "training_completion_rate",
      "label": "Security awareness training completion rate",
      "formulaHint": "completed / required  →  420 / 500"
    },
    {
      "id": "high_severity_incident_share",
      "label": "High-severity (P1+P2) incident share",
      "formulaHint": "(p1 + p2) / total  →  4 / 14"
    },
    {
      "id": "distractor_raw_ticket_count",
      "label": "Raw helpdesk ticket volume",
      "formulaHint": "unrelated vanity activity count (avoid for leadership brief)"
    }
  ],
  "minSelectedMetrics": 2,
  "maxSelectedMetrics": 3,
  "minRationaleLength": 120
}$initial$::jsonb,
  $expected${
  "calculations": {
    "poam_overdue_rate": { "value": 0.21875, "tolerance": 0.01 },
    "training_completion_rate": { "value": 0.84, "tolerance": 0.01 },
    "high_severity_incident_share": { "value": 0.2857142857, "tolerance": 0.01 }
  },
  "preferredMetricIds": [
    "poam_overdue_rate",
    "training_completion_rate",
    "high_severity_incident_share"
  ],
  "discouragedMetricIds": ["distractor_raw_ticket_count"],
  "minSelectedMetrics": 2,
  "maxSelectedMetrics": 3,
  "minRationaleLength": 120,
  "guidanceTopics": [
    "leadership-metric-purpose",
    "poam-aging-and-overdue",
    "training-completion",
    "incident-severity-context",
    "avoid-vanity-metrics",
    "rationale-quality"
  ],
  "topKGuidanceSections": 6
}$expected$::jsonb,
  '722',
  COALESCE(
    (
      SELECT MAX(tk.sort_order) + 1
      FROM public.tickets AS tk
      WHERE tk.track_id = grc.track_id
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
  SELECT id AS track_id FROM public.tracks WHERE slug = 'grc'
) AS grc
WHERE NOT EXISTS (
  SELECT 1
  FROM public.tickets AS existing
  WHERE existing.tenant_id = st.id
    AND existing.track_id = grc.track_id
    AND existing.ticket_type IN (
      'program_metrics_brief',
      'leadership_metrics',
      'isso_program_metrics'
    )
    AND (
      existing.initial_state->>'ticketCode' = 'ISSO-PM-01'
      OR existing.scenario_brief LIKE 'ProgramMetrics:%'
    )
);
