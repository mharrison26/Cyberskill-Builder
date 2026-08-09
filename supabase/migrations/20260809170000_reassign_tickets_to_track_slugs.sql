-- Reassign curriculum tickets from the catch-all `grc` track onto role tracks.
-- Prefer UPDATE (not duplication) so progress, flagship, and compilers stay coherent.

-- HelpDesk
UPDATE public.tickets t
SET track_id = (SELECT id FROM public.tracks WHERE slug = 'helpdesk')
WHERE t.track_id = (SELECT id FROM public.tracks WHERE slug = 'grc')
  AND (
    t.ticket_type IN (
      'triage', 'ticket_triage', 'helpdesk_triage',
      'mock_directory', 'directory_reset', 'account_unlock',
      'customer_reply', 'deescalation_reply', 'angry_email',
      'sla_escalation', 'escalate_or_resolve', 'escalation_decision',
      'sla_queue_sim', 'queue_simulation', 'timed_queue', 'multi_ticket_sim',
      'kb_writeup', 'helpdesk_kb', 'resolution_writeup', 'knowledge_article', 'kb_article',
      'coaching_feedback', 'peer_coaching', 'junior_notes_review',
      'kpi_report', 'ticket_metrics', 'helpdesk_kpis', 'csv_kpi_analysis',
      'helpdesk_capstone', 'kb_capstone', 'onboarding_process_capstone',
      'p1_status_updates', 'incident_status_cadence', 'stakeholder_updates', 'outage_comms'
    )
    OR COALESCE(t.initial_state->>'ticketCode', '') IN (
      'HD-02', 'HD-03', 'HD-04', 'HD-05', 'HD-07', 'HD-P1-01'
    )
    OR t.scenario_brief ~ '^(HD-|Triage:)'
  );

-- Sysadmin / IT Admin
UPDATE public.tickets t
SET track_id = (SELECT id FROM public.tracks WHERE slug = 'sysadmin')
WHERE t.track_id = (SELECT id FROM public.tracks WHERE slug = 'grc')
  AND (
    t.ticket_type IN (
      'network_diagnostics', 'pi04', 'traceroute_fault', 'command_output_diagnosis',
      'network_topology_fault', 'subnet_fault_diagnosis', 'topology_misconfig', 'network_fault_location',
      'backup_dr_plan', 'disaster_recovery',
      'config_fault_diagnosis', 'named_conf_fault', 'dns_config_fault', 'config_line_diagnosis',
      'fs_permissions_lab', 'sandbox_permissions', 'ls_permissions', 'permissions_explore',
      'config_remediation', 'config_diff',
      'cis_hardening', 'linux_hardening', 'sysadmin_hardening',
      'monitoring_config', 'alert_config', 'monitoring_alerts',
      'outage_capstone', 'incident_response_capstone', 'sysadmin_outage_capstone',
      'vuln_prioritization', 'patch_schedule',
      'infra_design_capstone', 'architecture_decision',
      'script_remediation', 'spooler_fix', 'service_restart',
      'ansible_playbook', 'iac_lab', 'ansible_lab', 'terraform_lab'
    )
    OR COALESCE(t.initial_state->>'ticketCode', '') IN ('SA-07', 'BK-01')
    OR t.scenario_brief LIKE 'SA-07:%'
    OR t.scenario_brief LIKE 'Print spooler%'
  );

-- Python Engineering
UPDATE public.tickets t
SET track_id = (SELECT id FROM public.tracks WHERE slug = 'python')
WHERE t.track_id = (SELECT id FROM public.tracks WHERE slug = 'grc')
  AND (
    t.ticket_type IN ('scripting_lab', 'script_fixtures', 'python', 'python_lab', 'shell')
    OR t.scenario_brief ILIKE 'Stale%'
    OR COALESCE(t.initial_state->>'ticketCode', '') LIKE 'PY-%'
  );

-- IT Auditor (+ HarborForge engagement)
UPDATE public.tickets t
SET track_id = (SELECT id FROM public.tracks WHERE slug = 'auditor')
WHERE t.track_id = (SELECT id FROM public.tracks WHERE slug = 'grc')
  AND (
    t.ticket_type IN (
      'audit_workpaper', 'workpaper',
      'itgc_access_revocation', 'timely_access_revocation',
      'sampling_methodology', 'assessment_sampling', 'transaction_sampling',
      'transaction_anomaly', 'csv_anomaly_detection', 'anomaly_detection',
      'cccer', 'cccer_exception', 'audit_finding_cccer',
      'continuous_auditing', 'continuous_audit_design',
      'risk_based_audit_plan', 'annual_audit_plan_capstone',
      'soc2_change_management_test', 'soc2_exception_testing',
      'audit_committee_brief', 'executive_summary_ac',
      'audit_planning_memo', 'planning_memo',
      'process_control_test', 'control_sample_test',
      'findings_summary', 'engagement_findings'
    )
    OR COALESCE(t.initial_state->>'ticketCode', '') IN (
      'WP-01', 'AP-CAP-01', 'CA-01', 'AUD-05', 'AUD-07', 'GRC-ANOMALY', 'GRC-SOC2-CC81'
    )
    OR t.scenario_brief ~ '^(AUD-|Stage [0-9])'
  );

UPDATE public.engagements e
SET track_id = (SELECT id FROM public.tracks WHERE slug = 'auditor')
WHERE e.slug = 'harborforge-fy2026-itgc'
  AND e.track_id = (SELECT id FROM public.tracks WHERE slug = 'grc');

-- ISSO ops + ATO package sources (keeps compileStudentPackage same-track)
UPDATE public.tickets t
SET track_id = (SELECT id FROM public.tracks WHERE slug = 'isso')
WHERE t.track_id = (SELECT id FROM public.tracks WHERE slug = 'grc')
  AND (
    t.ticket_type IN (
      'conmon_strategy', 'continuous_monitoring',
      'incident_notification', 'incident_reporting', 'isso_incident_notify',
      'cross_system_poam_priority', 'enterprise_poam_prioritization', 'isso_poam_portfolio',
      'authorization_package', 'ao_review',
      'poam_status_update', 'poam_remediation_status', 'poam_midpoint_update',
      'oscal_ssp', 'ssp', 'poam', 'poam_draft',
      'security_assessment_report', 'sar_summary',
      'oscal_generator', 'capstone_oscal'
    )
    OR COALESCE(t.initial_state->>'ticketCode', '') IN (
      'ISSO-01', 'ISSO-02', 'ISSO-04', 'ISSO-05', 'POAM-PORT-01',
      'GRC-03', 'GRC-04', 'GRC-05', 'GRC-09'
    )
    OR t.scenario_brief ~ '^ISSO-0[1245]:'
  );

-- ISSM
UPDATE public.tickets t
SET track_id = (SELECT id FROM public.tracks WHERE slug = 'issm')
WHERE t.track_id = (SELECT id FROM public.tracks WHERE slug = 'grc')
  AND (
    t.ticket_type IN (
      'issm_escalation', 'cross_system_escalation', 'isso_to_issm_escalation'
    )
    OR COALESCE(t.initial_state->>'ticketCode', '') = 'GRC-ISSM-ESC'
    OR t.scenario_brief ILIKE 'ISSM escalation:%'
  );
