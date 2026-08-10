-- Seed ISSM major-breach incident-command simulation (ISSM track).
--
-- Students act as ISSM across four unfolding stages of a HarborForge Payments
-- API compromise. Each stage presents a brief + decision point(s) with
-- distractors. Fully deterministic: per-decision set/exact match vs seeded
-- answer key + min justification length; optional passThresholdPercent.
--
-- ticket_type: breach_incident_command
-- aliases: major_breach_simulation, issm_incident_decisions
--
-- Idempotent: deletes prior seed rows by ticket_type + scenario marker.

DELETE FROM public.tickets
WHERE tenant_id IN (
    '00000000-0000-4000-8000-000000000001'::uuid, -- commercial
    '00000000-0000-4000-8000-000000000003'::uuid  -- dod_adjacent
  )
  AND track_id = (SELECT id FROM public.tracks WHERE slug = 'issm')
  AND ticket_type IN (
    'breach_incident_command',
    'major_breach_simulation',
    'issm_incident_decisions'
  )
  AND (
    initial_state->>'ticketCode' = 'ISSM-BREACH-CMD'
    OR scenario_brief LIKE 'Major breach simulation:%'
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
  'breach_incident_command',
  'high',
  75,
  'Major breach simulation: HarborForge Payments API ransomware / data staging — ISSM incident-command decisions across four stages (notify, legal/PR, external posture, containment)',
  $initial$
{
  "ticketCode": "ISSM-BREACH-CMD",
  "prompt": "As ISSM, work INC-2026-0847 through each stage. At every decision point, choose the incident-command action and briefly justify it. Premature public notice, skipping legal counsel, or declaring containment while beaconing remains will fail the answer key.",
  "role": "ISSM",
  "minJustificationLength": 40,
  "asOfDate": "2026-08-09",
  "incident": {
    "id": "INC-2026-0847",
    "title": "Suspected ransomware / data staging on payment tier",
    "system": "HarborForge Payments API",
    "severity": "Critical",
    "discoveredAt": "2026-08-09T14:12:00Z"
  },
  "stages": [
    {
      "id": "stage_detect",
      "title": "Stage 1 — Detection / triage",
      "brief": "14:12 UTC — SOC Tier-1 escalates EDR alerts on payment-tier hosts hf-pay-api-03 and hf-pay-batch-01. Behaviors include unusual PowerShell, credential dumping tooling, and large archive creation under a staging path. No confirmed data exfiltration yet. You are the on-call ISSM. Immediate command-and-control notifications must stand up the incident team without creating panic or tipping the adversary via public channels.",
      "decisionPoints": [
        {
          "id": "notify_immediate",
          "type": "multi_select",
          "prompt": "Who do you notify immediately?",
          "options": [
            {
              "id": "ciso",
              "label": "CISO",
              "detail": "Executive security owner for incident command authority."
            },
            {
              "id": "isso",
              "label": "ISSO (HarborForge Payments)",
              "detail": "System ISSO for authorization boundary and control context."
            },
            {
              "id": "soc_lead",
              "label": "SOC Lead",
              "detail": "Operational lead for hunt, containment actions, and evidence handling."
            },
            {
              "id": "all_staff_email",
              "label": "All-staff email blast",
              "detail": "Organization-wide notice before facts are confirmed."
            },
            {
              "id": "press",
              "label": "Press / media desk",
              "detail": "External media contact before legal and impact assessment."
            }
          ]
        }
      ]
    },
    {
      "id": "stage_confirm",
      "title": "Stage 2 — Confirmed compromise",
      "brief": "15:40 UTC — Forensics confirms interactive attacker presence and access to a payments database replica containing cardholder metadata and customer PII fields. Ransom note staging files appear on one host. Exfiltration volume is not yet proven, but data access is real. Legal privilege and messaging discipline matter now; PR messaging without confirmed impact often creates liability.",
      "decisionPoints": [
        {
          "id": "engage_legal_pr",
          "type": "single_select",
          "prompt": "When do you engage Legal and PR?",
          "options": [
            {
              "id": "now",
              "label": "Engage both Legal and PR immediately with equal urgency"
            },
            {
              "id": "legal_now_pr_later",
              "label": "Engage Legal now; bring PR in when impact and messaging needs are clearer"
            },
            {
              "id": "wait_containment",
              "label": "Wait until containment is declared before engaging either"
            },
            {
              "id": "not_needed",
              "label": "Neither Legal nor PR is needed for this incident"
            }
          ]
        }
      ]
    },
    {
      "id": "stage_impact",
      "title": "Stage 3 — Impact assessment",
      "brief": "17:05 UTC — Network telemetry shows ~42 GB egress to an unfamiliar external host overlapping the attacker dwell window. Preliminary analysis suggests customer PII and payment-related records may have been staged/exfiltrated. Counsel is engaged. Regulators and customers may eventually require notice, but facts, legal hold, and counsel-directed timing are not finished. A public blast or DIY customer email now would outrun the investigation.",
      "decisionPoints": [
        {
          "id": "external_notify",
          "type": "single_select",
          "prompt": "What is your external notification posture right now?",
          "options": [
            {
              "id": "customers_now",
              "label": "Email all customers immediately with breach details"
            },
            {
              "id": "counsel_led_plan",
              "label": "Counsel-led regulator/customer notification plan; no public notice yet"
            },
            {
              "id": "press_release_now",
              "label": "Issue a public press release naming the ransomware group now"
            },
            {
              "id": "no_external",
              "label": "Decide now that no external notification will ever be needed"
            }
          ]
        }
      ]
    },
    {
      "id": "stage_contain",
      "title": "Stage 4 — Containment declaration",
      "brief": "19:30 UTC — Payment API nodes were isolated and several attacker accounts disabled. Leadership asks whether you can declare the incident contained so recovery comms can start. Fresh EDR still shows intermittent beaconing from an unmanaged jump host that was not in the original isolation set, and one staging share still has unexplained write activity. Premature containment declarations create false confidence and bad recovery decisions.",
      "decisionPoints": [
        {
          "id": "declare_contained",
          "type": "single_select",
          "prompt": "Do you declare the incident contained?",
          "options": [
            {
              "id": "declare_now",
              "label": "Declare contained now and begin recovery communications"
            },
            {
              "id": "not_yet",
              "label": "Do not declare contained yet — persistence indicators remain"
            },
            {
              "id": "declare_and_close",
              "label": "Declare contained and close the incident ticket"
            }
          ]
        }
      ]
    }
  ]
}
$initial$::jsonb,
  $expected$
{
  "decisions": {
    "notify_immediate": {
      "type": "multi_select",
      "correctOptionIds": ["ciso", "isso", "soc_lead"]
    },
    "engage_legal_pr": {
      "type": "single_select",
      "correctOptionId": "legal_now_pr_later"
    },
    "external_notify": {
      "type": "single_select",
      "correctOptionId": "counsel_led_plan"
    },
    "declare_contained": {
      "type": "single_select",
      "correctOptionId": "not_yet"
    }
  },
  "minJustificationLength": 40,
  "passThresholdPercent": 100,
  "requireAllJustifications": true
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
    AND existing.ticket_type = 'breach_incident_command'
    AND (
      existing.initial_state->>'ticketCode' = 'ISSM-BREACH-CMD'
      OR existing.scenario_brief LIKE 'Major breach simulation:%'
    )
);
