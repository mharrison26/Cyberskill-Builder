-- Seed ISSM quality review of an ISSO POA&M entry (ISSM track).
--
-- Students act as ISSM: identify planted quality issues in an ISSO-submitted
-- POA&M entry (vague language, unrealistic milestone, missing owner) from a
-- checklist that includes distractors, then draft written feedback.
-- Fully deterministic: exact set match of issueIds + min feedback length.
--
-- ticket_type: issm_quality_review
-- aliases: isso_artifact_review, issm_ssp_poam_feedback
--
-- Idempotent: deletes prior seed rows by ticket_type + scenario marker.

DELETE FROM public.tickets
WHERE tenant_id IN (
    '00000000-0000-4000-8000-000000000001'::uuid, -- commercial
    '00000000-0000-4000-8000-000000000003'::uuid  -- dod_adjacent
  )
  AND track_id = (SELECT id FROM public.tracks WHERE slug = 'issm')
  AND ticket_type IN (
    'issm_quality_review',
    'isso_artifact_review',
    'issm_ssp_poam_feedback'
  )
  AND (
    initial_state->>'ticketCode' = 'ISSM-QR-POAM'
    OR scenario_brief LIKE 'ISSM quality review:%'
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
  'issm_quality_review',
  'medium',
  40,
  'ISSM quality review: HarborLedger POA&M-HL-014 uses vague remediation language, an unrealistic milestone, and has no named owner',
  $initial$
{
  "ticketCode": "ISSM-QR-POAM",
  "prompt": "You are the ISSM. ISSO Asha Patel submitted POA&M-HL-014 for inclusion in the enterprise register. Review the entry for quality defects, select every issue that applies from the checklist (some items are distractors), and draft written feedback telling the ISSO what must change before you will accept the entry.",
  "role": "ISSM",
  "artifactType": "poam_entry",
  "minFeedbackLength": 150,
  "asOfDate": "2026-08-09",
  "system": {
    "name": "HarborLedger Financial Reporting",
    "fismaId": "HL-FIN-2026"
  },
  "isso": {
    "name": "Asha Patel",
    "title": "ISSO"
  },
  "artifact": {
    "title": "POA&M-HL-014 — Privileged MFA enforcement gap",
    "controlId": "IA-2",
    "severity": "High",
    "weakness": "Phishing-resistant MFA is not enforced for several privileged finance-admin roles that authenticate into HarborLedger via the enterprise Entra ID tenant. A recent Conditional Access exception weakened the baseline for high-privilege paths used by the finance reporting package.",
    "plannedAction": "Work with IT to improve security posture as appropriate and update related documentation when feasible.",
    "milestoneDate": "2026-08-12",
    "owner": "TBD",
    "resources": "Identity Shared Services engineering time, enterprise identity budget line, and a coordinated CAB window for tenant-wide Conditional Access rollback.",
    "residualRisk": "Residual risk is acceptable until the improvement is completed.",
    "body": "Submitted 2026-08-09 by ISSO Patel for ISSM quality review prior to inclusion in the authorization-package POA&M register. Context: restoring the enterprise MFA baseline requires Identity Shared Services ownership and CAB approval — typically a multi-week effort."
  },
  "candidateIssues": [
    {
      "id": "vague_language",
      "label": "Planned action uses vague / non-enforceable language",
      "detail": "Phrases like \"improve security posture as appropriate\" and \"when feasible\" cannot be verified or enforced."
    },
    {
      "id": "unrealistic_milestone",
      "label": "Milestone / completion date is unrealistic for the remediation",
      "detail": "A 3-day completion (2026-08-12) is not credible for a tenant-wide IdP / CAB-driven change described in the resources."
    },
    {
      "id": "missing_owner",
      "label": "Remediation owner / POC is missing or marked TBD",
      "detail": "POA&M entries need a named accountable owner, not TBD."
    },
    {
      "id": "distractor_missing_ato",
      "label": "POA&M entry is invalid because it omits the current ATO package ID",
      "detail": "Check carefully — a package ID is not a required quality field on every POA&M line item."
    },
    {
      "id": "distractor_severity_wrong",
      "label": "Severity is incorrectly marked High and should be Low",
      "detail": "Check carefully — privileged MFA gaps on a High-impact finance system are appropriately High."
    }
  ]
}
$initial$::jsonb,
  $expected$
{
  "issueIds": [
    "vague_language",
    "unrealistic_milestone",
    "missing_owner"
  ],
  "minFeedbackLength": 150
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
    AND existing.ticket_type = 'issm_quality_review'
    AND (
      existing.initial_state->>'ticketCode' = 'ISSM-QR-POAM'
      OR existing.scenario_brief LIKE 'ISSM quality review:%'
    )
);
