-- Seed a Tier 2 ITGC timely access revocation ticket on the GRC track.
-- Students review a mock HR/IAM user access extract, conclude pass/fail, and
-- select exception users that violate the 5-calendar-day revocation SLA.
-- Scoring is fully deterministic against expected_state.

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
  'itgc_access_revocation',
  'medium',
  45,
  'ITGC: Test timely access revocation — conclude pass/fail and list exception users from the HR/IAM extract.',
  '{
    "prompt": "Using the HarborForge Access Revocation Standard, test whether terminated-user access was revoked within 5 calendar days of termination (testing as of 2026-03-15). Conclude pass or fail, and mark every exception user in the evidence table.",
    "controlObjective": "Logical access for terminated personnel is disabled or revoked within the policy SLA so that former employees cannot retain production system access.",
    "policy": {
      "title": "HarborForge Access Revocation Standard",
      "criteria": "For each terminated user, compare terminationDate to accessRevokedDate (or to the testing as-of date if access is still active). Access must be revoked within 5 calendar days of termination. Active employees are not exceptions. Terminated users still inside the 5-day window as of the as-of date are not exceptions yet.",
      "revokeWithinDays": 5,
      "asOfDate": "2026-03-15",
      "calendarBasis": "calendar_days"
    },
    "users": [
      {
        "id": "u-chen",
        "username": "mchen",
        "displayName": "Mei Chen",
        "department": "Finance",
        "employmentStatus": "active",
        "terminationDate": null,
        "accessStatus": "active",
        "accessRevokedDate": null
      },
      {
        "id": "u-patel",
        "username": "rpatel",
        "displayName": "Raj Patel",
        "department": "Engineering",
        "employmentStatus": "active",
        "terminationDate": null,
        "accessStatus": "active",
        "accessRevokedDate": null
      },
      {
        "id": "u-nguyen",
        "username": "lnguyen",
        "displayName": "Linh Nguyen",
        "department": "HR",
        "employmentStatus": "active",
        "terminationDate": null,
        "accessStatus": "active",
        "accessRevokedDate": null
      },
      {
        "id": "u-brooks",
        "username": "sbrooks",
        "displayName": "Sam Brooks",
        "department": "Operations",
        "employmentStatus": "active",
        "terminationDate": null,
        "accessStatus": "active",
        "accessRevokedDate": null
      },
      {
        "id": "u-okonkwo",
        "username": "aokonkwo",
        "displayName": "Ada Okonkwo",
        "department": "Legal",
        "employmentStatus": "active",
        "terminationDate": null,
        "accessStatus": "active",
        "accessRevokedDate": null
      },
      {
        "id": "u-foster",
        "username": "jfoster",
        "displayName": "Jamie Foster",
        "department": "Marketing",
        "employmentStatus": "active",
        "terminationDate": null,
        "accessStatus": "active",
        "accessRevokedDate": null
      },
      {
        "id": "u-kim",
        "username": "hkim",
        "displayName": "Hana Kim",
        "department": "IT",
        "employmentStatus": "active",
        "terminationDate": null,
        "accessStatus": "active",
        "accessRevokedDate": null
      },
      {
        "id": "u-diaz",
        "username": "cdiaz",
        "displayName": "Carlos Diaz",
        "department": "Operations",
        "employmentStatus": "terminated",
        "terminationDate": "2026-02-20",
        "accessStatus": "revoked",
        "accessRevokedDate": "2026-02-21"
      },
      {
        "id": "u-singh",
        "username": "psingh",
        "displayName": "Priya Singh",
        "department": "Finance",
        "employmentStatus": "terminated",
        "terminationDate": "2026-01-10",
        "accessStatus": "revoked",
        "accessRevokedDate": "2026-01-14"
      },
      {
        "id": "u-wallace",
        "username": "jwallace",
        "displayName": "Jordan Wallace",
        "department": "Sales",
        "employmentStatus": "terminated",
        "terminationDate": "2026-03-01",
        "accessStatus": "revoked",
        "accessRevokedDate": "2026-03-05"
      },
      {
        "id": "u-reed",
        "username": "mreed",
        "displayName": "Morgan Reed",
        "department": "Engineering",
        "employmentStatus": "terminated",
        "terminationDate": "2026-02-28",
        "accessStatus": "revoked",
        "accessRevokedDate": "2026-03-03"
      },
      {
        "id": "u-ali",
        "username": "sali",
        "displayName": "Samira Ali",
        "department": "Support",
        "employmentStatus": "terminated",
        "terminationDate": "2026-01-15",
        "accessStatus": "revoked",
        "accessRevokedDate": "2026-01-15"
      },
      {
        "id": "u-west",
        "username": "twest",
        "displayName": "Taylor West",
        "department": "Product",
        "employmentStatus": "terminated",
        "terminationDate": "2026-03-12",
        "accessStatus": "active",
        "accessRevokedDate": null
      },
      {
        "id": "u-torres",
        "username": "etorres",
        "displayName": "Elena Torres",
        "department": "Sales",
        "employmentStatus": "terminated",
        "terminationDate": "2026-02-01",
        "accessStatus": "revoked",
        "accessRevokedDate": "2026-02-10"
      },
      {
        "id": "u-hayes",
        "username": "chayes",
        "displayName": "Chris Hayes",
        "department": "Finance",
        "employmentStatus": "terminated",
        "terminationDate": "2026-01-20",
        "accessStatus": "revoked",
        "accessRevokedDate": "2026-02-01"
      },
      {
        "id": "u-park",
        "username": "npark",
        "displayName": "Noah Park",
        "department": "Engineering",
        "employmentStatus": "terminated",
        "terminationDate": "2026-03-01",
        "accessStatus": "active",
        "accessRevokedDate": null
      },
      {
        "id": "u-bennett",
        "username": "abennett",
        "displayName": "Avery Bennett",
        "department": "HR",
        "employmentStatus": "terminated",
        "terminationDate": "2026-02-10",
        "accessStatus": "active",
        "accessRevokedDate": null
      },
      {
        "id": "u-garcia",
        "username": "lgarcia",
        "displayName": "Luis Garcia",
        "department": "Operations",
        "employmentStatus": "terminated",
        "terminationDate": "2026-01-05",
        "accessStatus": "revoked",
        "accessRevokedDate": "2026-01-20"
      },
      {
        "id": "u-cho",
        "username": "mcho",
        "displayName": "Mina Cho",
        "department": "IT",
        "employmentStatus": "terminated",
        "terminationDate": "2026-03-08",
        "accessStatus": "active",
        "accessRevokedDate": null
      }
    ]
  }'::jsonb,
  '{
    "controlOutcome": "fail",
    "exceptionUserIds": [
      "u-bennett",
      "u-cho",
      "u-garcia",
      "u-hayes",
      "u-park",
      "u-torres"
    ]
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
      AND existing.ticket_type = 'itgc_access_revocation'
      AND existing.scenario_brief LIKE 'ITGC: Test timely access revocation%'
  );
