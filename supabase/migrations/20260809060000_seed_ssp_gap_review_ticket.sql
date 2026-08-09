-- Seed a Tier 2 draft SSP gap-review ticket on the GRC track.
--
-- Students review a HarborNet CMS draft SSP excerpt with intentional quality
-- gaps (missing control, vague implementation, wrong AO role, inherited with
-- no provider) and select matching findings from a checklist that includes
-- distractors. Fully deterministic scoring with partial credit.
--
-- ticket_type: ssp_gap_review
-- aliases: ssp_quality_review, draft_ssp_gaps
--
-- Idempotent: deletes prior seed rows by ticket_type + scenario marker.

DELETE FROM public.tickets
WHERE tenant_id IN (
    '00000000-0000-4000-8000-000000000001'::uuid, -- commercial
    '00000000-0000-4000-8000-000000000003'::uuid  -- dod_adjacent
  )
  AND track_id = (SELECT id FROM public.tracks WHERE slug = 'grc')
  AND ticket_type IN (
    'ssp_gap_review',
    'ssp_quality_review',
    'draft_ssp_gaps'
  )
  AND (
    initial_state->>'ticketCode' = 'GRC-SSP-GAP'
    OR scenario_brief LIKE 'SSP gap review:%'
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
  grc.track_id,
  2,
  'ssp_gap_review',
  'medium',
  45,
  'SSP gap review: identify quality gaps in the HarborNet CMS draft System Security Plan excerpt',
  $initial$
{
  "ticketCode": "GRC-SSP-GAP",
  "systemName": "HarborNet Case Management System (CMS)",
  "sspTitle": "Draft System Security Plan — excerpt for peer quality review",
  "prompt": "You are peer-reviewing a draft SSP excerpt before it goes to the ISSO. Identify every quality gap in the excerpt. Select all matching findings from the checklist — some items are distractors that do not apply.",
  "sspExcerpt": {
    "overview": "HarborNet CMS is a Moderate-impact web application used by a regional port authority to track vessel clearances, inspector assignments, and limited PII for credentialed contractors. The system runs in an AWS commercial region with Entra ID workforce identity and a public portal behind a WAF.",
    "roles": "Information System Security Officer (ISSO): Sam Ortiz.\nSystem Owner: Priya Shah.\nAuthorizing Official (risk acceptance / ATO decision authority): HarborNet Tier-1 Help Desk.\nCommon Control Provider: (not specified in this draft).",
    "controlImplementations": [
      {
        "controlId": "AC-2",
        "title": "Account Management",
        "status": "Implemented",
        "responsibleRole": "ISSO",
        "narrative": "HarborNet accounts are provisioned through the joiner-mover-leaver workflow in Entra ID. Disabled accounts are reviewed weekly by the ISSO; unused accounts are disabled after 45 days."
      },
      {
        "controlId": "AC-3",
        "title": "Access Enforcement",
        "status": "Implemented",
        "responsibleRole": "System Admin",
        "narrative": "Role-based access control is enforced in the API gateway. Inspectors receive read/write to assigned cases only; contractors receive read-only portal access scoped to their organization."
      },
      {
        "controlId": "AU-2",
        "title": "Event Logging",
        "status": "Implemented",
        "responsibleRole": "System Admin",
        "narrative": "The CMS logs authentication events, privilege changes, case create/update/delete, and admin configuration changes to CloudWatch. Logs are retained for 365 days and forwarded nightly to the central log archive."
      },
      {
        "controlId": "CM-2",
        "title": "Baseline Configuration",
        "status": "Implemented",
        "responsibleRole": "System Admin",
        "narrative": "Configuration management is implemented as required."
      },
      {
        "controlId": "IA-2",
        "title": "Identification and Authentication (Organizational Users)",
        "status": "Implemented",
        "responsibleRole": "ISSO",
        "narrative": "Organizational users authenticate via Entra ID with phishing-resistant MFA. Authenticator assurance is reviewed annually by the ISSO; failed authentications lock after five attempts."
      },
      {
        "controlId": "SC-7",
        "title": "Boundary Protection",
        "status": "Inherited",
        "responsibleRole": "—",
        "narrative": "Boundary protection is inherited from the hosting environment. No further customer configuration is documented in this SSP."
      }
    ]
  },
  "candidateGaps": [
    {
      "id": "gap-missing-ac-6",
      "label": "Missing AC-6 (Least Privilege) — Access Control family jumps from AC-2/AC-3 with no least-privilege implementation statement",
      "detail": "A Moderate system SSP should address least privilege; the AC family excerpt omits it entirely."
    },
    {
      "id": "gap-vague-cm-2",
      "label": "CM-2 implementation statement is vague — \"implemented as required\" with no how / who / when",
      "detail": "SSP narratives need a concrete baseline, owner, and maintenance cadence."
    },
    {
      "id": "gap-wrong-ao-role",
      "label": "Wrong responsible role — Tier-1 Help Desk is listed as Authorizing Official for risk acceptance",
      "detail": "ATO / risk acceptance authority cannot sit with Help Desk."
    },
    {
      "id": "gap-inherited-sc-7",
      "label": "SC-7 marked Inherited but no common-control provider is named",
      "detail": "Inherited controls must identify the provider (e.g., cloud CSP / agency common control catalog)."
    },
    {
      "id": "distractor-au-2-ok",
      "label": "AU-2 is incomplete because audited event types are not listed",
      "detail": "Check carefully — the AU-2 narrative may already list event types."
    },
    {
      "id": "distractor-ia-2-freq",
      "label": "IA-2 is missing an authentication review frequency",
      "detail": "Check carefully — the IA-2 narrative may already state an annual review."
    }
  ]
}
$initial$::jsonb,
  $expected$
{
  "requiredGapIds": [
    "gap-missing-ac-6",
    "gap-vague-cm-2",
    "gap-wrong-ao-role",
    "gap-inherited-sc-7"
  ],
  "passThresholdPercent": 100
}
$expected$::jsonb,
  '612',
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
) AS grc;
