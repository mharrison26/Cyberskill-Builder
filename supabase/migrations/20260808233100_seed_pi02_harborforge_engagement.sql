-- PI-02: Seed HarborForge FY2026 multi-stage engagement on the GRC track.
-- Stages: planning memo → ITGC access revocation → AP process control → findings summary.

DO $$
DECLARE
  v_tenant_id uuid := '00000000-0000-4000-8000-000000000001'::uuid;
  v_track_id uuid;
  v_engagement_id uuid := 'a1000000-0000-4000-8000-000000000201'::uuid;
  v_base_sort integer;
BEGIN
  SELECT t.id INTO v_track_id
  FROM public.tracks AS t
  WHERE t.slug = 'grc'
  LIMIT 1;

  IF v_track_id IS NULL THEN
    RAISE NOTICE 'GRC track not found; skipping PI-02 HarborForge engagement seed.';
    RETURN;
  END IF;

  SELECT COALESCE(MAX(tk.sort_order), 0) INTO v_base_sort
  FROM public.tickets AS tk
  WHERE tk.track_id = v_track_id;

  INSERT INTO public.engagements (
    id,
    tenant_id,
    track_id,
    slug,
    title,
    scope,
    sort_order
  )
  VALUES (
    v_engagement_id,
    v_tenant_id,
    v_track_id,
    'harborforge-fy2026-itgc',
    'HarborForge FY2026 ITGC & process control engagement',
    '{
      "company": "HarborForge Systems",
      "period": "FY2026 (1 Jan 2026 – 31 Dec 2026)",
      "system": "HarborForge ERP / Okta IAM",
      "summary": "Integrated ITGC and procure-to-pay process control testing for HarborForge Systems.",
      "inScopeProcesses": ["Procure-to-pay (AP three-way match)", "User access lifecycle"],
      "inScopeItgcs": ["ITGC-AC-01 Timely access revocation", "ITGC-CM-02 Change approvals (context)"]
    }'::jsonb,
    10
  )
  ON CONFLICT (track_id, slug) DO UPDATE
  SET
    title = EXCLUDED.title,
    scope = EXCLUDED.scope,
    sort_order = EXCLUDED.sort_order;

  -- Prefer the canonical engagement id for subsequent ticket inserts.
  SELECT e.id INTO v_engagement_id
  FROM public.engagements AS e
  WHERE e.track_id = v_track_id
    AND e.slug = 'harborforge-fy2026-itgc';

  -- Stage 1: Audit planning memo
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
    sort_order,
    engagement_id,
    engagement_stage
  )
  SELECT
    v_tenant_id,
    v_track_id,
    2,
    'audit_planning_memo',
    'medium',
    45,
    'Stage 1 — Draft the HarborForge FY2026 audit planning memo.',
    '{
      "prompt": "Draft a planning memo for the HarborForge FY2026 engagement. Cover engagement objective, in-scope systems/processes, risk focus for ITGC and AP controls, and the planned procedures you will execute in later stages.",
      "engagementScope": {
        "company": "HarborForge Systems",
        "period": "FY2026",
        "system": "HarborForge ERP / Okta IAM"
      }
    }'::jsonb,
    '{"minFieldLength": 40}'::jsonb,
    '612',
    v_base_sort + 1,
    v_engagement_id,
    1
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.tickets AS existing
    WHERE existing.engagement_id = v_engagement_id
      AND existing.engagement_stage = 1
  );

  -- Stage 2: ITGC timely access revocation (reuses itgc_access_revocation type)
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
    sort_order,
    engagement_id,
    engagement_stage
  )
  SELECT
    v_tenant_id,
    v_track_id,
    2,
    'itgc_access_revocation',
    'medium',
    45,
    'Stage 2 — Test ITGC timely access revocation against the HR/IAM extract.',
    '{
      "prompt": "Evaluate whether terminated-user access was revoked within 5 calendar days per HarborForge policy. Mark the control pass or fail and list every exception user ID.",
      "controlObjective": "Access for terminated personnel is revoked timely per policy (within 5 calendar days).",
      "policy": {
        "title": "HarborForge Access Revocation Standard",
        "criteria": "Access must be revoked within 5 calendar days of the termination date.",
        "revokeWithinDays": 5,
        "asOfDate": "2026-03-15",
        "calendarBasis": "calendar_days"
      },
      "users": [
        {
          "id": "u-chen",
          "displayName": "Mei Chen",
          "username": "mchen",
          "department": "Finance",
          "employmentStatus": "active",
          "terminationDate": null,
          "accessStatus": "active",
          "accessRevokedDate": null
        },
        {
          "id": "u-torres",
          "displayName": "Elena Torres",
          "username": "etorres",
          "department": "Sales",
          "employmentStatus": "terminated",
          "terminationDate": "2026-02-01",
          "accessStatus": "revoked",
          "accessRevokedDate": "2026-02-10"
        },
        {
          "id": "u-park",
          "displayName": "Noah Park",
          "username": "npark",
          "department": "Engineering",
          "employmentStatus": "terminated",
          "terminationDate": "2026-03-01",
          "accessStatus": "active",
          "accessRevokedDate": null
        },
        {
          "id": "u-diaz",
          "displayName": "Carlos Diaz",
          "username": "cdiaz",
          "department": "Ops",
          "employmentStatus": "terminated",
          "terminationDate": "2026-02-20",
          "accessStatus": "revoked",
          "accessRevokedDate": "2026-02-21"
        }
      ]
    }'::jsonb,
    '{
      "controlOutcome": "fail",
      "exceptionUserIds": ["u-park", "u-torres"]
    }'::jsonb,
    '612',
    v_base_sort + 2,
    v_engagement_id,
    2
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.tickets AS existing
    WHERE existing.engagement_id = v_engagement_id
      AND existing.engagement_stage = 2
  );

  -- Stage 3: Process control test (AP three-way match)
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
    sort_order,
    engagement_id,
    engagement_stage
  )
  SELECT
    v_tenant_id,
    v_track_id,
    2,
    'process_control_test',
    'medium',
    45,
    'Stage 3 — Test AP three-way match / invoice approval on a sample of invoices.',
    '{
      "prompt": "Review the AP sample. An invoice is an exception if approval is missing/pending or if the three-way match failed (no PO or quantity mismatch). Determine pass/fail for the control and select all exception item IDs.",
      "controlObjective": "Invoices are approved and matched to PO and goods receipt before payment (three-way match).",
      "sampleItems": [
        {
          "id": "inv-100",
          "label": "Acme office supplies",
          "vendor": "Acme Co",
          "invoiceNumber": "A-1001",
          "poNumber": "PO-5501",
          "amount": "1240.00",
          "approver": "finance.mgr",
          "approvalStatus": "approved",
          "matchStatus": "matched"
        },
        {
          "id": "inv-200",
          "label": "Northwind hardware — no PO",
          "vendor": "Northwind",
          "invoiceNumber": "N-882",
          "poNumber": "",
          "amount": "8900.00",
          "approver": "ops.lead",
          "approvalStatus": "approved",
          "matchStatus": "no_po",
          "notes": "Paid without a purchase order on file."
        },
        {
          "id": "inv-300",
          "label": "Contoso SaaS renewal — pending approval",
          "vendor": "Contoso",
          "invoiceNumber": "C-4410",
          "poNumber": "PO-5610",
          "amount": "24000.00",
          "approver": "",
          "approvalStatus": "pending",
          "matchStatus": "matched",
          "notes": "Payment released while approval was still pending."
        },
        {
          "id": "inv-400",
          "label": "Fabrikam freight",
          "vendor": "Fabrikam",
          "invoiceNumber": "F-219",
          "poNumber": "PO-5702",
          "amount": "610.50",
          "approver": "logistics.mgr",
          "approvalStatus": "approved",
          "matchStatus": "matched"
        }
      ]
    }'::jsonb,
    '{
      "controlOutcome": "fail",
      "exceptionItemIds": ["inv-200", "inv-300"],
      "minNotesLength": 40
    }'::jsonb,
    '612',
    v_base_sort + 3,
    v_engagement_id,
    3
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.tickets AS existing
    WHERE existing.engagement_id = v_engagement_id
      AND existing.engagement_stage = 3
  );

  -- Stage 4: Findings summary
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
    sort_order,
    engagement_id,
    engagement_stage
  )
  SELECT
    v_tenant_id,
    v_track_id,
    2,
    'findings_summary',
    'medium',
    45,
    'Stage 4 — Compile the HarborForge engagement findings summary.',
    '{
      "prompt": "Using the prior-stage outcomes below, write an executive summary, detailed findings, and recommendations. Your write-up must address the access revocation and three-way match exception themes from testing.",
      "priorStageOutcomes": [
        {
          "title": "ITGC timely access revocation",
          "detail": "Control failed. Exceptions: Elena Torres (revoked 9 days after termination) and Noah Park (still active after termination)."
        },
        {
          "title": "AP three-way match / invoice approval",
          "detail": "Control failed. Exceptions: inv-200 (paid with no PO) and inv-300 (paid while approval pending)."
        }
      ]
    }'::jsonb,
    '{
      "minFieldLength": 40,
      "requiredThemes": ["access revocation", "three-way match"]
    }'::jsonb,
    '612',
    v_base_sort + 4,
    v_engagement_id,
    4
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.tickets AS existing
    WHERE existing.engagement_id = v_engagement_id
      AND existing.engagement_stage = 4
  );
END $$;
