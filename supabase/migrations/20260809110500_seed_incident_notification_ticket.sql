-- Seed a Tier 2 incident_notification ticket on the GRC track (ISSO training).
-- Students review a fictional security incident + pinned notification-timeline
-- policy, select required recipients with deadline hours, and draft the
-- notification. Scoring is fully deterministic for recipient+deadline pairs;
-- draft is a min-length completeness gate only.
--
-- ticket_type: incident_notification
-- aliases: incident_reporting, isso_incident_notify
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
  'incident_notification',
  'medium',
  45,
  $brief$
ISSO-02: Confirmed unauthorized access to prod-billing-api — identify required notification recipients/deadlines from the agency timeline policy and draft the incident notification.
$brief$,
  $initial${
    "ticketCode": "ISSO-02",
    "prompt": "Using the pinned agency incident notification timeline, identify every recipient required for this confirmed unauthorized-access incident and enter each deadline in hours from discovery. Do not notify parties the policy does not require for these facts. Then draft the notification content.",
    "incident": {
      "id": "INC-2026-0412",
      "title": "Unauthorized access to production billing API",
      "discoveredAt": "2026-04-12T14:05:00Z",
      "summary": "At 14:05 UTC on 12 April 2026, the SOC confirmed that a stolen service account API key was used to call prod-billing-api endpoints outside normal change windows. The key was revoked at 14:22 UTC. Initial review shows read access to customer invoice metadata (account numbers, invoice amounts, billing emails). No evidence of payment-card PAN exposure. Containment is in progress; forensic imaging of the API gateway logs has started.",
      "system": "prod-billing-api (HarborForge commercial SaaS, Moderate impact system)",
      "impact": "Possible unauthorized disclosure of customer invoice metadata for approximately 1,200 accounts during a 40-minute window. Service availability was not interrupted. Privacy review is pending and has not yet confirmed a reportable privacy breach.",
      "classification": "Confirmed unauthorized access / Category 1 (security incident)"
    },
    "policy": {
      "title": "Agency Incident Notification Timeline (educational)",
      "document": "ISSO Incident Reporting SOP — notification clocks from discovery",
      "rules": [
        {
          "recipientId": "issm",
          "recipientLabel": "ISSM",
          "deadlineHours": 1,
          "description": "Report all confirmed Category 1 security incidents to the Information System Security Manager within 1 hour of discovery. Include incident ID, system, discovery time, and known impact."
        },
        {
          "recipientId": "ao",
          "recipientLabel": "Authorizing Official",
          "deadlineHours": 24,
          "description": "Notify the Authorizing Official within 24 hours of discovery for confirmed unauthorized access affecting a production authorized system."
        },
        {
          "recipientId": "us-cert",
          "recipientLabel": "US-CERT / CISA",
          "deadlineHours": 72,
          "description": "Report federal / agency-reportable cyber incidents to US-CERT (CISA) within 72 hours of discovery when unauthorized access to a production system is confirmed."
        },
        {
          "recipientId": "privacy-officer",
          "recipientLabel": "Privacy Officer",
          "deadlineHours": 24,
          "description": "Notify the Privacy Officer within 24 hours only when a privacy breach involving PII/PHI is confirmed by Privacy. Do not notify solely on possible metadata exposure pending privacy determination."
        },
        {
          "recipientId": "public-affairs",
          "recipientLabel": "Public Affairs",
          "deadlineHours": 4,
          "description": "Notify Public Affairs within 4 hours only when the incident is already public, media-facing, or an external customer communication has been authorized. Routine internal incidents do not require Public Affairs notification."
        }
      ]
    }
  }$initial$::jsonb,
  $expected${
    "requiredNotifications": [
      { "recipientId": "issm", "deadlineHours": 1 },
      { "recipientId": "ao", "deadlineHours": 24 },
      { "recipientId": "us-cert", "deadlineHours": 72 }
    ],
    "minDraftLength": 120,
    "allowExtraRecipients": false
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
        'incident_notification',
        'incident_reporting',
        'isso_incident_notify'
      )
      AND (
        existing.initial_state->>'ticketCode' = 'ISSO-02'
        OR existing.scenario_brief LIKE 'ISSO-02:%'
      )
  );
