-- Seed a Tier 2 SOC 2 CC8.1 change-management exception-testing ticket
-- on the GRC track (commercial tenant). Fully deterministic: students apply
-- a written procedure to 10 mock change tickets and report exception count/rate
-- plus the exception ID set.

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
  'soc2_change_management_test',
  'medium',
  45,
  'SOC 2 CC8.1 change management: execute the written test procedure against a sample of 10 production change tickets and report the exception count and rate.',
  $initial$
{
  "ticketCode": "GRC-SOC2-CC81",
  "prompt": "Apply the written CC8.1 test procedure to each change ticket in the sample. Flag exceptions, then report exception count and rate for the population (n=10).",
  "criterion": {
    "id": "CC8.1",
    "title": "Change Management",
    "description": "The entity authorizes, designs, develops, configures, documents, tests, approves, and implements changes to infrastructure, data, software, and procedures to meet its objectives."
  },
  "testProcedure": [
    "Obtain the sample of 10 production change tickets listed in the evidence table.",
    "For each change with changeType standard or normal: confirm approved is true and testEvidence is present (non-empty). Missing either is an exception.",
    "For each standard/normal change with requiresCab true: confirm cabApproved is true. Deployed without CAB approval is an exception.",
    "For each emergency change: confirm retroApproval is true. Pre-approval and testEvidence may be absent for emergencies and are not exceptions by themselves.",
    "Count every ticket that fails any applicable criterion above as one exception. Compute exception rate as exceptions / population size."
  ],
  "exceptionDefinition": "Exception if: (1) standard/normal and approved=false; (2) standard/normal and testEvidence empty; (3) standard/normal with requiresCab=true and cabApproved=false; or (4) emergency with retroApproval=false.",
  "changeTickets": [
    {
      "id": "CHG-2401",
      "title": "Bump API gateway rate limits",
      "changeType": "standard",
      "requester": "alex.nguyen",
      "approver": "priya.shah",
      "approved": true,
      "testEvidence": "Load test report LT-441 attached",
      "requiresCab": false,
      "cabApproved": false,
      "retroApproval": null,
      "deployedAt": "2026-03-02T14:00:00Z",
      "environment": "prod"
    },
    {
      "id": "CHG-2402",
      "title": "Rotate TLS certs on edge",
      "changeType": "standard",
      "requester": "jordan.lee",
      "approver": "priya.shah",
      "approved": true,
      "testEvidence": "Staging cert swap validated",
      "requiresCab": true,
      "cabApproved": true,
      "retroApproval": null,
      "deployedAt": "2026-03-04T09:30:00Z",
      "environment": "prod"
    },
    {
      "id": "CHG-2403",
      "title": "Enable new feature flag checkout_v2",
      "changeType": "standard",
      "requester": "sam.ortiz",
      "approver": null,
      "approved": false,
      "testEvidence": "QA checklist QC-88",
      "requiresCab": false,
      "cabApproved": false,
      "retroApproval": null,
      "deployedAt": "2026-03-05T16:10:00Z",
      "environment": "prod"
    },
    {
      "id": "CHG-2404",
      "title": "Increase DB connection pool",
      "changeType": "standard",
      "requester": "morgan.cho",
      "approver": "priya.shah",
      "approved": true,
      "testEvidence": null,
      "requiresCab": false,
      "cabApproved": false,
      "retroApproval": null,
      "deployedAt": "2026-03-06T11:00:00Z",
      "environment": "prod"
    },
    {
      "id": "CHG-2405",
      "title": "Patch nginx to 1.26.2",
      "changeType": "standard",
      "requester": "alex.nguyen",
      "approver": "devon.park",
      "approved": true,
      "testEvidence": "Canary 10% healthy for 45m",
      "requiresCab": false,
      "cabApproved": false,
      "retroApproval": null,
      "deployedAt": "2026-03-07T08:15:00Z",
      "environment": "prod"
    },
    {
      "id": "CHG-2406",
      "title": "Emergency firewall rule for DDoS",
      "changeType": "emergency",
      "requester": "soc.oncall",
      "approver": null,
      "approved": false,
      "testEvidence": null,
      "requiresCab": false,
      "cabApproved": false,
      "retroApproval": false,
      "deployedAt": "2026-03-08T02:40:00Z",
      "environment": "prod"
    },
    {
      "id": "CHG-2407",
      "title": "Emergency revoke compromised API key",
      "changeType": "emergency",
      "requester": "soc.oncall",
      "approver": "priya.shah",
      "approved": true,
      "testEvidence": null,
      "requiresCab": false,
      "cabApproved": false,
      "retroApproval": true,
      "deployedAt": "2026-03-09T01:05:00Z",
      "environment": "prod"
    },
    {
      "id": "CHG-2408",
      "title": "Cutover payment processor hostname",
      "changeType": "standard",
      "requester": "finance.eng",
      "approver": "devon.park",
      "approved": true,
      "testEvidence": "UAT runbook UR-12 signed",
      "requiresCab": true,
      "cabApproved": false,
      "retroApproval": null,
      "deployedAt": "2026-03-10T19:00:00Z",
      "environment": "prod"
    },
    {
      "id": "CHG-2409",
      "title": "Update CDN cache TTL",
      "changeType": "normal",
      "requester": "jordan.lee",
      "approver": "priya.shah",
      "approved": true,
      "testEvidence": "Staging TTL validation",
      "requiresCab": false,
      "cabApproved": false,
      "retroApproval": null,
      "deployedAt": "2026-03-11T13:20:00Z",
      "environment": "prod"
    },
    {
      "id": "CHG-2410",
      "title": "Add read replica for reporting",
      "changeType": "standard",
      "requester": "data.platform",
      "approver": "devon.park",
      "approved": true,
      "testEvidence": "Replica lag < 1s for 2h",
      "requiresCab": true,
      "cabApproved": true,
      "retroApproval": null,
      "deployedAt": "2026-03-12T10:45:00Z",
      "environment": "prod"
    }
  ]
}
$initial$::jsonb,
  $expected$
{
  "exceptionCount": 4,
  "exceptionRate": 40,
  "exceptionIds": ["CHG-2403", "CHG-2404", "CHG-2406", "CHG-2408"],
  "requireExceptionIds": true,
  "rateTolerance": 0
}
$expected$::jsonb,
  '612',
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
      AND existing.ticket_type = 'soc2_change_management_test'
      AND existing.scenario_brief LIKE 'SOC 2 CC8.1 change management:%'
  );
