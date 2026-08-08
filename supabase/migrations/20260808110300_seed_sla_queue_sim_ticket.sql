-- Seed PI-09 timed multi-ticket queue simulation (helpdesk-style on GRC track).
--
-- One parent ticket embeds 5 mini-tickets in initial_state.items.
-- Student starts a shared SLA clock, triages + resolves each item, then submits
-- the batch once. Scorer grades SLA compliance % and triage/resolution correctness %.
--
-- ticket_type: sla_queue_sim
-- aliases: queue_simulation, timed_queue, multi_ticket_sim
--
-- Idempotent: deletes prior seed rows by stable scenario_brief marker per tenant.

DELETE FROM public.tickets
WHERE tenant_id IN (
    '00000000-0000-4000-8000-000000000001'::uuid,
    '00000000-0000-4000-8000-000000000003'::uuid
  )
  AND track_id = (SELECT id FROM public.tracks WHERE slug = 'grc')
  AND ticket_type IN (
    'sla_queue_sim',
    'queue_simulation',
    'timed_queue',
    'multi_ticket_sim'
  )
  AND scenario_brief LIKE 'PI-09:%';

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
  1,
  'sla_queue_sim',
  'high',
  45,
  'PI-09: Timed queue — clear five concurrent tickets under SLA',
  jsonb_build_object(
    'prompt', 'Five tickets opened at 08:00. Start the simulation to begin all SLA timers, work highest urgency first, and resolve each item with the correct priority, category, and action before submitting the batch.',
    'items', jsonb_build_array(
      jsonb_build_object(
        'id', 'INC-1001',
        'subject', 'VPN down for entire sales floor',
        'body', 'Sales cannot reach CRM or file shares over VPN. Roughly 40 users affected; deals are stalled for the morning stand-up.',
        'requester', 'Sales Manager',
        'difficulty', 'critical',
        'slaMinutes', 5,
        'categoryOptions', jsonb_build_array('network', 'access', 'software', 'security'),
        'resolutionOptions', jsonb_build_array(
          jsonb_build_object('id', 'restart_vpn_concentrator', 'label', 'Restart VPN concentrator / restore tunnel'),
          jsonb_build_object('id', 'password_reset', 'label', 'Reset a single user password'),
          jsonb_build_object('id', 'ignore', 'label', 'Close as noise')
        )
      ),
      jsonb_build_object(
        'id', 'INC-1002',
        'subject', 'CFO account locked after travel',
        'body', 'Executive assistant reports the CFO is locked out and needs the board pack within the hour. Identity verification completed by phone.',
        'requester', 'CFO Executive Assistant',
        'difficulty', 'high',
        'slaMinutes', 10,
        'categoryOptions', jsonb_build_array('account', 'access', 'security', 'how_to'),
        'resolutionOptions', jsonb_build_array(
          jsonb_build_object('id', 'unlock_account', 'label', 'Unlock account after verification'),
          jsonb_build_object('id', 'escalate_security', 'label', 'Escalate to security without unlocking'),
          jsonb_build_object('id', 'create_new_account', 'label', 'Create a brand-new account')
        )
      ),
      jsonb_build_object(
        'id', 'INC-1003',
        'subject', 'Finance floor printer jammed',
        'body', 'Shared finance printer shows a paper jam. Month-end packets are waiting but users can print to a nearby device.',
        'requester', 'AP Clerk',
        'difficulty', 'medium',
        'slaMinutes', 20,
        'categoryOptions', jsonb_build_array('hardware', 'software', 'how_to', 'other'),
        'resolutionOptions', jsonb_build_array(
          jsonb_build_object('id', 'dispatch_facilities', 'label', 'Dispatch facilities / clear jam'),
          jsonb_build_object('id', 'replace_toner', 'label', 'Replace toner only'),
          jsonb_build_object('id', 'ignore', 'label', 'Close without action')
        )
      ),
      jsonb_build_object(
        'id', 'INC-1004',
        'subject', 'Suspected phishing / wire fraud email',
        'body', 'User received an urgent wire-transfer request that spoofs Finance. Link looks credential-harvesting. No one has clicked yet.',
        'requester', 'Staff Accountant',
        'difficulty', 'high',
        'slaMinutes', 10,
        'categoryOptions', jsonb_build_array('security', 'email', 'how_to', 'other'),
        'resolutionOptions', jsonb_build_array(
          jsonb_build_object('id', 'escalate_security', 'label', 'Escalate to security / SOC'),
          jsonb_build_object('id', 'delete_mail', 'label', 'Tell user to delete and move on'),
          jsonb_build_object('id', 'unlock_account', 'label', 'Unlock account')
        )
      ),
      jsonb_build_object(
        'id', 'INC-1005',
        'subject', 'Request Microsoft Visio license',
        'body', 'Analyst wants Visio for a one-off architecture diagram. Not blocking production work.',
        'requester', 'Business Analyst',
        'difficulty', 'low',
        'slaMinutes', 30,
        'categoryOptions', jsonb_build_array('software', 'how_to', 'access', 'other'),
        'resolutionOptions', jsonb_build_array(
          jsonb_build_object('id', 'catalog_request', 'label', 'Route through software catalog / approval'),
          jsonb_build_object('id', 'install_now', 'label', 'Install immediately without approval'),
          jsonb_build_object('id', 'ignore', 'label', 'Close without action')
        )
      )
    )
  ),
  jsonb_build_object(
    'passSlaCompliancePercent', 80,
    'passCorrectnessPercent', 80,
    'slaWeight', 0.5,
    'correctnessWeight', 0.5,
    'items', jsonb_build_object(
      'INC-1001', jsonb_build_object(
        'expectedPriority', 'P1',
        'expectedCategory', 'network',
        'expectedResolution', 'restart_vpn_concentrator'
      ),
      'INC-1002', jsonb_build_object(
        'expectedPriority', 'P2',
        'expectedCategory', 'account',
        'expectedResolution', 'unlock_account'
      ),
      'INC-1003', jsonb_build_object(
        'expectedPriority', 'P3',
        'expectedCategory', 'hardware',
        'expectedResolution', 'dispatch_facilities'
      ),
      'INC-1004', jsonb_build_object(
        'expectedPriority', 'P2',
        'expectedCategory', 'security',
        'expectedResolution', 'escalate_security'
      ),
      'INC-1005', jsonb_build_object(
        'expectedPriority', 'P4',
        'expectedCategory', 'software',
        'expectedResolution', 'catalog_request'
      )
    )
  ),
  '722',
  15
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
