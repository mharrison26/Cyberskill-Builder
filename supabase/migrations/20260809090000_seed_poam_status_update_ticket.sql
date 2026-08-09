-- Seed a Tier 2 POA&M mid-remediation status update ticket on the GRC track.
-- Students review a fictional POA&M item (weakness, milestones, evidence, dates,
-- owner), choose on_track | delayed | closed, and justify the update.
-- Scoring is fully deterministic against expected_state.expectedStatus.
-- Evidence-before-closure: closed is rejected when required evidence is missing
-- or unverified in the scenario (seeded answer key = delayed).
--
-- Idempotent: skips insert when the same ticket_type + scenario_brief exists.

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
  'poam_status_update',
  'medium',
  40,
  'POA&M status: Update mid-remediation privileged MFA item (HarborForge AC-2).',
  '{
    "prompt": "As of 2026-03-15, update the status of POAM-AC-2-01. Choose on track, delayed, or closed, and justify using milestones, dates, and evidence. Do not close without verified closure evidence.",
    "asOfDate": "2026-03-15",
    "closurePolicy": "A POA&M item may be closed only when remediation is complete and verification evidence is provided and verified. Draft plans or unverified compensating controls are not sufficient for closure.",
    "poamItem": {
      "id": "POAM-AC-2-01",
      "controlId": "ac-2",
      "title": "Privileged MFA enforcement",
      "weakness": "Privileged remote access accounts for HarborForge production jump hosts can authenticate with password-only credentials. Assessment finding FIND-AC-2-01 remains open until MFA is enforced and independently verified.",
      "owner": "Jamie Torres, IAM Lead",
      "scheduledCompletionDate": "2026-03-01",
      "currentStatus": "ongoing",
      "milestones": [
        {
          "id": "m1",
          "description": "Select MFA vendor and approve architecture",
          "dueDate": "2026-01-15",
          "status": "complete"
        },
        {
          "id": "m2",
          "description": "Enforce MFA for all privileged remote accounts",
          "dueDate": "2026-02-28",
          "status": "slipped"
        },
        {
          "id": "m3",
          "description": "Independent verification / privileged access review",
          "dueDate": "2026-03-01",
          "status": "not_started"
        }
      ]
    },
    "evidence": [
      {
        "id": "ev-1",
        "label": "Draft MFA rollout plan (unsigned)",
        "provided": true,
        "verified": false
      },
      {
        "id": "ev-2",
        "label": "Post-implementation privileged access review",
        "provided": false,
        "verified": false
      }
    ]
  }'::jsonb,
  '{
    "expectedStatus": "delayed",
    "minJustificationLength": 80,
    "requireEvidenceForClosed": true,
    "allowedClosedEvidenceIds": ["ev-2"]
  }'::jsonb,
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
      AND existing.ticket_type IN (
        'poam_status_update',
        'poam_remediation_status',
        'poam_midpoint_update'
      )
      AND existing.scenario_brief LIKE 'POA&M status: Update mid-remediation%'
  );
