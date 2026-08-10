-- Seed program-level risk rollup ticket (ISSM track).
--
-- Students (ISSM / program risk role) review residual risk ratings across
-- several systems, then select the top 3 risk-weighted program risks and
-- common themes, plus a short narrative summary.
--
-- Scoring is fully deterministic:
--   - topRiskIds: ordered exact match (requireExactTopRiskOrder = true)
--   - themeIds: order-independent set equality
--   - summary: min length gate
--
-- programWeight on candidateRisks is for admin/key documentation only;
-- the student UI does not display it — students weight from system citations
-- and per-system scores.
--
-- ticket_type: program_risk_summary
-- aliases: aggregated_risk_summary, issm_program_risk_rollups
--
-- Idempotent: NOT EXISTS on ticketCode / scenario marker per tenant+track.

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
  'program_risk_summary',
  'medium',
  40,
  'Program risk summary: Aggregate HarborForge system risk ratings into a FY2026 Q3 program rollup (top 3 risks + themes)',
  $initial$
{
  "ticketCode": "ISSM-PRS-01",
  "prompt": "You are the ISSM for HarborForge. Aggregate the system risk ratings below into a program-level summary for FY2026 Q3. Select the top 3 program risks (highest risk-weighted first) and the common themes that span multiple systems. Weight each candidate by residual severity/score and how many systems cite it.",
  "program": {
    "name": "HarborForge Enterprise Security Program",
    "reportingPeriod": "FY2026 Q3"
  },
  "systems": [
    {
      "id": "sys_hr",
      "name": "HR Portal",
      "overallRating": "high",
      "risks": [
        {
          "id": "risk_priv_access",
          "title": "Excessive privileged access",
          "severity": "high",
          "likelihood": "moderate",
          "score": 12
        },
        {
          "id": "risk_patch_latency",
          "title": "Patch latency on internet-facing hosts",
          "severity": "high",
          "likelihood": "high",
          "score": 16
        }
      ]
    },
    {
      "id": "sys_pay",
      "name": "Payment API Gateway",
      "overallRating": "high",
      "risks": [
        {
          "id": "risk_patch_latency",
          "title": "Patch latency on internet-facing hosts",
          "severity": "high",
          "likelihood": "high",
          "score": 16
        },
        {
          "id": "risk_logging_gaps",
          "title": "Incomplete security logging & monitoring",
          "severity": "high",
          "likelihood": "moderate",
          "score": 12
        }
      ]
    },
    {
      "id": "sys_iam",
      "name": "Identity Broker",
      "overallRating": "moderate",
      "risks": [
        {
          "id": "risk_priv_access",
          "title": "Excessive privileged access",
          "severity": "high",
          "likelihood": "moderate",
          "score": 12
        },
        {
          "id": "risk_logging_gaps",
          "title": "Incomplete security logging & monitoring",
          "severity": "moderate",
          "likelihood": "moderate",
          "score": 9
        }
      ]
    },
    {
      "id": "sys_collab",
      "name": "Collaboration Suite",
      "overallRating": "high",
      "risks": [
        {
          "id": "risk_patch_latency",
          "title": "Patch latency on internet-facing hosts",
          "severity": "high",
          "likelihood": "moderate",
          "score": 12
        },
        {
          "id": "risk_priv_access",
          "title": "Excessive privileged access",
          "severity": "moderate",
          "likelihood": "moderate",
          "score": 9
        }
      ]
    },
    {
      "id": "sys_vendor",
      "name": "Vendor SaaS Portal",
      "overallRating": "moderate",
      "risks": [
        {
          "id": "risk_vendor_saas",
          "title": "Third-party SaaS control assurance gaps",
          "severity": "moderate",
          "likelihood": "moderate",
          "score": 8
        },
        {
          "id": "risk_logging_gaps",
          "title": "Incomplete security logging & monitoring",
          "severity": "moderate",
          "likelihood": "moderate",
          "score": 9
        }
      ]
    },
    {
      "id": "sys_badge",
      "name": "Facilities Badge System",
      "overallRating": "low",
      "risks": [
        {
          "id": "risk_distractor_physical",
          "title": "Data center physical access logging lag",
          "severity": "low",
          "likelihood": "low",
          "score": 4
        }
      ]
    }
  ],
  "candidateRisks": [
    {
      "id": "risk_patch_latency",
      "title": "Patch latency on internet-facing hosts",
      "programWeight": 55
    },
    {
      "id": "risk_priv_access",
      "title": "Excessive privileged access",
      "programWeight": 42
    },
    {
      "id": "risk_logging_gaps",
      "title": "Incomplete security logging & monitoring",
      "programWeight": 38
    },
    {
      "id": "risk_vendor_saas",
      "title": "Third-party SaaS control assurance gaps",
      "programWeight": 20
    },
    {
      "id": "risk_distractor_physical",
      "title": "Data center physical access logging lag",
      "programWeight": 8
    }
  ],
  "candidateThemes": [
    {
      "id": "theme_identity_access",
      "label": "Identity & privileged access weaknesses",
      "detail": "Privileged / identity control gaps appear across multiple systems."
    },
    {
      "id": "theme_vuln_mgmt",
      "label": "Vulnerability / patch management delays",
      "detail": "Internet-facing hosts remain unpatched beyond risk appetite."
    },
    {
      "id": "theme_monitoring",
      "label": "Incomplete logging & monitoring",
      "detail": "Security event coverage is incomplete across authorization boundaries."
    },
    {
      "id": "theme_distractor_facilities",
      "label": "Data center physical security",
      "detail": "Distractor — only one low-impact facilities system cites physical access logging."
    }
  ],
  "topN": 3,
  "minSummaryLength": 120
}
$initial$::jsonb,
  $expected$
{
  "topRiskIds": [
    "risk_patch_latency",
    "risk_priv_access",
    "risk_logging_gaps"
  ],
  "themeIds": [
    "theme_identity_access",
    "theme_vuln_mgmt",
    "theme_monitoring"
  ],
  "requireExactTopRiskOrder": true,
  "minSummaryLength": 120,
  "passThresholdPercent": 100
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
    AND existing.ticket_type IN (
      'program_risk_summary',
      'aggregated_risk_summary',
      'issm_program_risk_rollups'
    )
    AND (
      existing.initial_state->>'ticketCode' = 'ISSM-PRS-01'
      OR existing.scenario_brief LIKE 'Program risk summary:%'
    )
);
