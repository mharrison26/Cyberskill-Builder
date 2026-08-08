-- Seed a Tier 1 sla_escalation ticket on the GRC track (commercial tenant).
-- Students read a pinned SLA/escalation policy + support scenario, choose
-- escalate or resolve, and justify; scored with deterministic decision match
-- + RAG against data/helpdesk/sla-escalation-policy.json.

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
  1,
  'sla_escalation',
  'medium',
  30,
  $brief$
East campus VPN authentication is failing for ~40 remote workers. Tier-1 VPN runbook steps are exhausted with no restoration. Decide whether to escalate or resolve under the helpdesk SLA/escalation policy, and justify the decision with a policy citation tied to scenario facts.
$brief$,
  $initial${
    "policy": {
      "title": "Tier-1 SLA targets and escalate-or-resolve policy",
      "document": "Helpdesk SLA and Escalation Policy (educational)",
      "sections": [
        {
          "id": "sla-targets",
          "title": "Response and resolution SLA targets",
          "text": "Priority SLAs (business hours unless marked 24x7): P1 Critical — acknowledge within 15 minutes, continuous work until service restored or formally handed to an on-call owner; P2 High — acknowledge within 1 hour, resolve or provide a workaround within 4 hours; P3 Medium — acknowledge within 4 hours, resolve within 2 business days; P4 Low — acknowledge within 1 business day, resolve within 5 business days. Missing an acknowledge target without documented escalation is a policy violation."
        },
        {
          "id": "tier1-scope",
          "title": "What Tier 1 may resolve without escalation",
          "text": "Tier 1 may resolve and close tickets when the issue is within documented runbooks: password reset or account unlock after identity verification, MFA re-enrollment for a single user, how-to guidance for standard tools, and known issues with a published workaround that restores the requester. Resolve only when the requester confirms the symptom is gone or an approved workaround is in place and documented."
        },
        {
          "id": "escalate-triggers",
          "title": "Mandatory escalation triggers",
          "text": "Escalate immediately (do not attempt a final close as Tier 1) when any of the following apply: (1) confirmed or suspected multi-user or site-wide outage of a production service; (2) security incident indicators (credential stuffing at scale, malware, phishing with confirmed credential compromise, unauthorized access); (3) executive / VIP or externally facing customer-impacting failure; (4) risk of imminent SLA breach on a P1/P2 after Tier-1 steps are exhausted; (5) potential data loss, corruption, or irreversible change requiring privileged change control. When escalating, capture symptoms, impact scope, steps already tried, and the policy trigger cited."
        },
        {
          "id": "escalation-path",
          "title": "Escalation path and handoff quality",
          "text": "Escalate to Tier 2 for application/platform defects and complex access issues; escalate to Security/IR for security triggers; escalate to on-call infrastructure for production outages outside Tier-1 runbooks. A valid escalation notes: who is affected and how many, business impact, timeline of symptoms, exact troubleshooting already performed, and the specific policy trigger. Do not escalate solely because the ticket is inconvenient; do not resolve-and-close when a mandatory trigger is present."
        },
        {
          "id": "decision-test",
          "title": "Escalate-or-resolve decision test",
          "text": "Choose Resolve only when the issue is inside Tier-1 scope and no mandatory escalation trigger applies. Choose Escalate when any mandatory trigger applies, even if a temporary workaround exists. Justifications must cite the matching policy section (scope vs trigger) and tie facts from the scenario (impact, user count, security signals, VIP, SLA pressure) to that rule. Generic statements such as 'this seems important' without a policy link do not meet the standard."
        }
      ]
    },
    "scenario": {
      "title": "East campus VPN outage",
      "summary": "At 09:10, the service desk queue fills with reports that corporate VPN authentication fails for remote workers on the East campus. Approximately 40 users are affected. The published Tier-1 VPN runbook (client reset, DNS flush, portal status check) has been completed for three sample users with no restoration. Status page shows no known issue. No malware alerts; Security says there are no confirmed compromise indicators yet. A regional sales standup starts in 20 minutes and depends on VPN file shares.",
      "requester": "Multiple East campus remote workers (queue flood)",
      "priorityHint": "P2 trending toward P1 if unresolved",
      "impact": "Production remote access degraded for ~40 users; customer-facing sales activity blocked.",
      "symptoms": "VPN client fails at authentication; portal reachable; password resets do not restore access.",
      "timeline": "09:10 first reports; 09:25 three Tier-1 runbook attempts failed; 09:35 still down.",
      "stepsTried": "Client reinstall guidance, DNS flush, identity-verified password reset for three users, checked vendor status page."
    },
    "prompt": "Decide whether to escalate or resolve at Tier 1. Justify using the SLA/escalation policy."
  }$initial$::jsonb,
  $expected${
    "expectedDecision": "escalate",
    "minJustificationLength": 80,
    "guidanceTopics": [
      "tier1-scope",
      "escalate-triggers",
      "decision-test",
      "escalation-path",
      "sla-targets"
    ],
    "topKGuidanceSections": 5
  }$expected$::jsonb,
  '411',
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
      AND existing.ticket_type = 'sla_escalation'
      AND existing.scenario_brief LIKE 'East campus VPN authentication%'
  );
