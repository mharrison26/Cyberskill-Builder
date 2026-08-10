-- Seed a Tier 2 RACI responsibility-matrix ticket on the GRC track (ISSO/GRC).
-- Students review a fictional HarborForge org chart and assign R/A/C/I for
-- annual risk assessment activities. Scoring is fully deterministic against
-- expected_state.assignments (cell-by-cell match).
--
-- ticket_type: raci_matrix
-- aliases: raci, responsibility_matrix
--
-- Idempotent: skips insert when the same scenario marker already exists.

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
  'raci_matrix',
  'medium',
  40,
  $brief$
ISSO-RACI: Assign RACI roles for HarborForge annual risk assessment using the org chart — one Accountable and at least one Responsible per activity.
$brief$,
  $initial${
    "ticketCode": "ISSO-RACI",
    "orgName": "HarborForge Security Governance",
    "prompt": "HarborForge is kicking off the annual risk assessment for prod-billing-api. Using the org chart and role descriptions, complete the RACI matrix for each activity. Assign exactly one Accountable (A) and at least one Responsible (R) per row. Leave a cell blank when that role has no involvement.",
    "activitySummary": "The Information System Security Officer (ISSO) coordinates the annual risk assessment for the Moderate-impact billing platform. The ISSM owns the security program outcome. The System Owner owns residual risk acceptance decisions for the business. The Authorizing Official remains the authorization decision authority and must be informed of material risk posture changes. The CISO advises on enterprise risk aggregation. Privacy is consulted when assessment scope touches customer PII metadata; Internal Audit is informed so the annual plan stays aligned.",
    "orgUnits": [
      {
        "id": "ao",
        "title": "Authorizing Official",
        "name": "Dana Ortega",
        "reportsTo": null,
        "description": "Authorization decision authority for prod-billing-api."
      },
      {
        "id": "ciso",
        "title": "CISO",
        "name": "Marcus Hale",
        "reportsTo": "ao",
        "description": "Enterprise cyber risk and security program leadership."
      },
      {
        "id": "issm",
        "title": "ISSM",
        "name": "Priya Shah",
        "reportsTo": "ciso",
        "description": "Information system security manager for the billing portfolio."
      },
      {
        "id": "system_owner",
        "title": "System Owner",
        "name": "Avery Kim",
        "reportsTo": "ao",
        "description": "Business owner of prod-billing-api and residual risk acceptance."
      },
      {
        "id": "isso",
        "title": "ISSO",
        "name": "Chris Nguyen",
        "reportsTo": "issm",
        "description": "Day-to-day security lead; drafts assessment artifacts."
      },
      {
        "id": "privacy_officer",
        "title": "Privacy Officer",
        "name": "Elena Vargas",
        "reportsTo": "ciso",
        "description": "Consulted when assessments involve customer PII metadata."
      },
      {
        "id": "internal_audit",
        "title": "Internal Audit",
        "name": "Jordan Blake",
        "reportsTo": "ao",
        "description": "Independent assurance; kept informed of annual risk outcomes."
      }
    ],
    "roles": [
      { "id": "isso", "title": "ISSO", "name": "Chris Nguyen" },
      { "id": "issm", "title": "ISSM", "name": "Priya Shah" },
      { "id": "system_owner", "title": "System Owner", "name": "Avery Kim" },
      { "id": "ao", "title": "Authorizing Official", "name": "Dana Ortega" },
      { "id": "ciso", "title": "CISO", "name": "Marcus Hale" },
      { "id": "privacy_officer", "title": "Privacy Officer", "name": "Elena Vargas" },
      { "id": "internal_audit", "title": "Internal Audit", "name": "Jordan Blake" }
    ],
    "activities": [
      {
        "id": "conduct_assessment",
        "label": "Conduct annual risk assessment",
        "description": "Plan, perform, and document the annual risk assessment for prod-billing-api (threats, vulnerabilities, likelihood/impact, and risk register updates)."
      },
      {
        "id": "accept_residual_risk",
        "label": "Accept residual risk",
        "description": "Decide whether residual risk after planned treatments is acceptable for continued operation pending authorization status."
      },
      {
        "id": "communicate_results",
        "label": "Communicate assessment results",
        "description": "Distribute the assessment outcome and material risk changes to required governance stakeholders."
      }
    ],
    "raciLegend": {
      "R": "Responsible — does the work",
      "A": "Accountable — owns the outcome (exactly one per activity)",
      "C": "Consulted — provides input before decisions",
      "I": "Informed — kept up to date on progress/outcomes"
    }
  }$initial$::jsonb,
  $expected${
    "assignments": {
      "conduct_assessment": {
        "isso": "R",
        "issm": "A",
        "system_owner": "C",
        "ao": "I",
        "ciso": "C",
        "privacy_officer": "C",
        "internal_audit": "I"
      },
      "accept_residual_risk": {
        "isso": "C",
        "issm": "C",
        "system_owner": "R",
        "ao": "A",
        "ciso": "C",
        "privacy_officer": "",
        "internal_audit": "I"
      },
      "communicate_results": {
        "isso": "R",
        "issm": "A",
        "system_owner": "C",
        "ao": "I",
        "ciso": "I",
        "privacy_officer": "I",
        "internal_audit": "I"
      }
    },
    "passThresholdPercent": 100,
    "requireSingleAccountable": true,
    "requireAtLeastOneResponsible": true
  }$expected$::jsonb,
  '722',
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
      AND existing.ticket_type IN (
        'raci_matrix',
        'raci',
        'responsibility_matrix'
      )
      AND (
        existing.initial_state->>'ticketCode' = 'ISSO-RACI'
        OR existing.scenario_brief LIKE 'ISSO-RACI:%'
      )
  );
