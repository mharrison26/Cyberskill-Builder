-- Seed Tier 2 backup / disaster recovery plan ticket.
--
-- Students draft a backup & DR plan for a fictional small business:
--   - backup frequency
--   - retention
--   - RPO targets
--   - RTO targets
--   - restore-testing cadence
--   - optional overall plan notes
-- Graded via RAG against a pinned backup/DR best-practices checklist
-- (data/backup/backup-dr-best-practices-checklist.json).
--
-- How to create / customize this ticket content:
--   1. Admin → Tickets → create or edit a ticket with ticket_type = backup_dr_plan
--      (alias: disaster_recovery)
--   2. Put business inventory in initial_state.businessProfile + initial_state.systems
--   3. Optional expected_state knobs:
--        minFieldLength, guidanceTopics, topKGuidanceSections
--
-- Idempotent: deletes prior seed rows by stable scenario_brief marker per tenant.

-- ---------------------------------------------------------------------------
-- Commercial + DoD-adjacent tenants (stable UUIDs from 0002 / 0020)
-- ---------------------------------------------------------------------------

WITH seed_tenants AS (
  SELECT id
  FROM public.tenants
  WHERE id IN (
    '00000000-0000-4000-8000-000000000001'::uuid, -- commercial
    '00000000-0000-4000-8000-000000000003'::uuid  -- dod_adjacent
  )
),
grc AS (
  SELECT id AS track_id FROM public.tracks WHERE slug = 'grc'
)
DELETE FROM public.tickets t
USING seed_tenants st, grc
WHERE t.tenant_id = st.id
  AND t.track_id = grc.track_id
  AND t.ticket_type IN ('backup_dr_plan', 'disaster_recovery')
  AND (
    t.scenario_brief LIKE 'Backup/DR:%'
    OR t.initial_state->>'ticketCode' = 'BK-01'
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
  'backup_dr_plan',
  'medium',
  60,
  'Backup/DR: Draft a backup and disaster recovery plan for BrightLedger Bookkeeping',
  jsonb_build_object(
    'ticketCode', 'BK-01',
    'businessProfile', jsonb_build_object(
      'name', 'BrightLedger Bookkeeping LLC',
      'description', 'An 18-person bookkeeping and payroll firm serving ~120 small-business clients in two offices (main office + home-office hybrid staff).',
      'industry', 'Professional services / bookkeeping',
      'constraints', 'Limited IT budget: one part-time MSP, no secondary data center. Must protect client PII/financial data and keep payroll/invoicing recoverable after ransomware or hardware failure.'
    ),
    'systems', jsonb_build_array(
      jsonb_build_object(
        'name', 'On-prem Windows file server',
        'description', 'Shared client workpapers, scanned W-9s, and engagement letters (~2 TB). Actively edited during tax season.',
        'criticality', 'High',
        'location', 'Main office server closet',
        'dataTypes', 'Client financial documents, PII'
      ),
      jsonb_build_object(
        'name', 'SaaS CRM (HubSpot)',
        'description', 'Client pipeline, renewal dates, and contact history. Vendor provides platform backups; firm has never exported data.',
        'criticality', 'Medium',
        'location', 'Vendor SaaS',
        'dataTypes', 'Client contacts, opportunity notes'
      ),
      jsonb_build_object(
        'name', 'On-prem SQL Server (invoicing / timekeeping)',
        'description', 'Line-of-business database for invoices, time entries, and AR. Transactional during business hours; overnight batch posts.',
        'criticality', 'Critical',
        'location', 'Main office (same host as file roles / adjacent VM)',
        'dataTypes', 'Invoices, payments, employee time'
      ),
      jsonb_build_object(
        'name', 'Endpoints + Microsoft 365',
        'description', '25 Windows laptops with Entra ID / M365 email and OneDrive. Finance staff sometimes keep working drafts only on the laptop before upload.',
        'criticality', 'Medium-High',
        'location', 'Hybrid workforce',
        'dataTypes', 'Email, OneDrive files, local drafts'
      )
    ),
    'prompt', 'Draft a backup and disaster recovery plan for BrightLedger: set backup frequency, retention, RPO and RTO targets, and restore-testing cadence across the inventoried systems. Optional notes may cover offsite/immutable copies or ownership.'
  ),
  jsonb_build_object(
    'minFieldLength', 40,
    'guidanceTopics', jsonb_build_array(
      'backup-frequency',
      'retention',
      'rpo-targets',
      'rto-targets',
      'restore-testing'
    ),
    'topKGuidanceSections', 6
  ),
  NULL,
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
