-- Training feedback: option rationales + free-text rubrics on GRC scenarios.
-- Content lives in tickets.initial_state / expected_state jsonb (scenario schema).
-- Rich graded feedback is persisted on portfolio_items.structured_result.trainingFeedback.

COMMENT ON COLUMN public.portfolio_items.structured_result IS
  'Machine-readable payload (OSCAL observation or score details). Ticket resolutions may include trainingFeedback: checklist TP/FP/FN rationales, rubric dimensions, score/percentile/SLA, reviewNext.';

COMMENT ON COLUMN public.tickets.initial_state IS
  'Scenario prompt + UI seed. Checklist options may be objects { id, label?, rationale?, controlId? } (or legacy plain strings).';

COMMENT ON COLUMN public.tickets.expected_state IS
  'Deterministic scoring rules. Free-text scenarios may include rubric.dimensions[{ id, label, criteria, keywords?, submissionField?, modelAnswer? }] and reviewNext.';

-- ---------------------------------------------------------------------------
-- GRC-01 control_mapping: rich options with authored rationales + reviewNext
-- ---------------------------------------------------------------------------
UPDATE public.tickets AS t
SET
  initial_state =
    COALESCE(t.initial_state, '{}'::jsonb)
    || jsonb_build_object(
      'source_framework', 'nist_800_53',
      'source_control_id', 'AC-2',
      'source_label', 'NIST SP 800-53 Rev. 5 — AC-2 Account Management',
      'prompt',
      'Given NIST SP 800-53 control AC-2, select every equivalent SOC 2 Trust Services Criterion and ISO/IEC 27001:2022 Annex A control from the candidate lists. Scoring uses the reference crosswalk table (not an AI guess). Then explain where those mappings are strong versus only partially overlapping (for example, where SOC 2 CC6.1 does not test account-review cadence the way AC-2 requires).',
      'targets',
      $targets$[
        {
          "framework": "soc2",
          "label": "SOC 2 Trust Services Criteria",
          "options": [
            {
              "id": "CC6.1",
              "rationale": "True mapping: CC6.1 covers logical access security software, infrastructure, and data — the closest TSC analogue to AC-2 account management for granting and managing credentials."
            },
            {
              "id": "CC6.2",
              "rationale": "True mapping: CC6.2 addresses registration and authorization of new access — overlaps AC-2 account establishment and modification workflows."
            },
            {
              "id": "CC6.3",
              "rationale": "True mapping: CC6.3 covers role changes and access removal — maps to AC-2 account modification / termination expectations."
            },
            {
              "id": "CC7.1",
              "rationale": "Distractor: CC7.1 is about detecting and monitoring security events, not account lifecycle management. Selecting it is a false positive for an AC-2 crosswalk."
            },
            {
              "id": "A1.2",
              "rationale": "Distractor: A1.2 is an Availability criterion (recovery objectives), not access management. Leave it unchecked."
            }
          ]
        },
        {
          "framework": "iso27001",
          "label": "ISO/IEC 27001:2022 Annex A",
          "options": [
            {
              "id": "A.5.15",
              "rationale": "True mapping: A.5.15 Access control addresses rules for granting access — aligned with AC-2 account-management policy intent."
            },
            {
              "id": "A.5.16",
              "rationale": "True mapping: A.5.16 Identity management covers identity lifecycle — a primary ISO analogue to AC-2."
            },
            {
              "id": "A.5.18",
              "rationale": "True mapping: A.5.18 Access rights covers provisioning and review of access rights — overlaps AC-2 account review / modification."
            },
            {
              "id": "A.5.7",
              "rationale": "Distractor: A.5.7 Threat intelligence is about collecting and analyzing threat information, not managing accounts."
            },
            {
              "id": "A.8.9",
              "rationale": "Distractor: A.8.9 Configuration management is about baselines and hardened configs, not identity/account management."
            }
          ]
        }
      ]$targets$::jsonb
    ),
  expected_state =
    COALESCE(t.expected_state, '{}'::jsonb)
    || $egrc01${
      "scoringMode": "options_set_match",
      "passThresholdPercent": 100,
      "gradeOverlapNarrative": true,
      "minOverlapNarrativeLength": 120,
      "reviewNext": {
        "title": "AC-2 Account Management in the Control Catalog",
        "href": "/tracks/grc/catalog?q=AC-2",
        "reason": "Re-read the AC-2 statement and assessment objective so you can explain where SOC 2 / ISO mappings are only partial (especially account review cadence)."
      },
      "rubric": {
        "dimensions": [
          {
            "id": "overlapNarrative",
            "label": "Strong vs partial overlap narrative",
            "submissionField": "overlapNarrative",
            "criteria": "Explain where SOC 2 and ISO mappings are strong versus only partially overlapping relative to AC-2 (especially account review cadence).",
            "keywords": ["partial", "review", "cadence", "CC6.1", "account", "overlap"],
            "modelAnswer": "CC6.1/CC6.2 map strongly to logical access and credential management aspects of AC-2, but SOC 2 does not test periodic account review cadence the way AC-2 requires. ISO A.5.15/A.5.16/A.5.18 cover identity lifecycle more closely, yet still need org-specific review evidence to fully satisfy AC-2."
          }
        ]
      }
    }$egrc01$::jsonb
FROM public.tracks AS tr
WHERE t.track_id = tr.id
  AND tr.slug = 'grc'
  AND t.ticket_type = 'control_mapping'
  AND lower(COALESCE(t.initial_state->>'source_control_id', '')) = 'ac-2';

-- ---------------------------------------------------------------------------
-- SSP gap review: authored rationales + controlIds on every candidate
-- ---------------------------------------------------------------------------
UPDATE public.tickets AS t
SET
  initial_state =
    COALESCE(t.initial_state, '{}'::jsonb)
    || jsonb_build_object(
      'candidateGaps',
      $gaps$[
        {
          "id": "gap-missing-ac-6",
          "controlId": "AC-6",
          "label": "Missing AC-6 (Least Privilege) — Access Control family jumps from AC-2/AC-3 with no least-privilege implementation statement",
          "detail": "A Moderate system SSP should address least privilege; the AC family excerpt omits it entirely.",
          "rationale": "True positive: AC-6 Least Privilege is absent from the AC family excerpt. Moderate systems are expected to document how privileged functions are restricted — omitting AC-6 is a real SSP gap."
        },
        {
          "id": "gap-vague-cm-2",
          "controlId": "CM-2",
          "label": "CM-2 implementation statement is vague — \"implemented as required\" with no how / who / when",
          "detail": "SSP narratives need a concrete baseline, owner, and maintenance cadence.",
          "rationale": "True positive: CM-2's narrative is boilerplate. A quality SSP needs the baseline source, owner, and how often the baseline is reviewed/updated."
        },
        {
          "id": "gap-wrong-ao-role",
          "label": "Wrong responsible role — Tier-1 Help Desk is listed as Authorizing Official for risk acceptance",
          "detail": "ATO / risk acceptance authority cannot sit with Help Desk.",
          "rationale": "True positive: Authorizing Official / risk acceptance authority cannot be Help Desk. This is an organizational role error, not a control-statement omission."
        },
        {
          "id": "gap-inherited-sc-7",
          "controlId": "SC-7",
          "label": "SC-7 marked Inherited but no common-control provider is named",
          "detail": "Inherited controls must identify the provider (e.g., cloud CSP / agency common control catalog).",
          "rationale": "True positive: Inherited SC-7 must name the common-control provider. Inheritance without a provider is incomplete SSP documentation."
        },
        {
          "id": "distractor-au-2-ok",
          "controlId": "AU-2",
          "label": "AU-2 is incomplete because audited event types are not listed",
          "detail": "Check carefully — the AU-2 narrative may already list event types.",
          "rationale": "False positive / distractor: the AU-2 narrative already lists audited event types. Selecting this means you flagged a control that is adequately described."
        },
        {
          "id": "distractor-ia-2-freq",
          "controlId": "IA-2",
          "label": "IA-2 is missing an authentication review frequency",
          "detail": "Check carefully — the IA-2 narrative may already state an annual review.",
          "rationale": "False positive / distractor: IA-2 already states an annual authenticator assurance review. Leaving this unchecked is correct."
        }
      ]$gaps$::jsonb
    ),
  expected_state =
    COALESCE(t.expected_state, '{}'::jsonb)
    || $essp${
      "requiredGapIds": [
        "gap-missing-ac-6",
        "gap-vague-cm-2",
        "gap-wrong-ao-role",
        "gap-inherited-sc-7"
      ],
      "passThresholdPercent": 100,
      "reviewNext": {
        "title": "AC-6 Least Privilege in the Control Catalog",
        "href": "/tracks/grc/catalog?q=AC-6",
        "reason": "Review AC-6 (and CM-2 / SC-7) statements so you can spot missing or inherited-without-provider narratives in future SSP drafts."
      }
    }$essp$::jsonb
FROM public.tracks AS tr
WHERE t.track_id = tr.id
  AND tr.slug = 'grc'
  AND t.ticket_type IN ('ssp_gap_review', 'ssp_quality_review', 'draft_ssp_gaps');

-- ---------------------------------------------------------------------------
-- Audit planning memo: free-text rubric + model answers
-- ---------------------------------------------------------------------------
UPDATE public.tickets AS t
SET
  expected_state =
    COALESCE(t.expected_state, '{}'::jsonb)
    || $erubric${
      "rubric": {
        "passThresholdPercent": 70,
        "modelAnswer": "Objective: assess ITGC operating effectiveness over logical access for Northwind ERP. Scope: in-scope applications, joiner-mover-leaver population for the audit period. Risk focus: privileged access, timely revocation, SOD conflicts. Planned procedures: population completeness testing, sample attribute testing, exception evaluation.",
        "dimensions": [
          {
            "id": "objective",
            "label": "Engagement objective",
            "submissionField": "objective",
            "criteria": "States what will be assessed and why (control objective / assertion).",
            "keywords": ["assess", "effectiveness", "control", "objective", "ITGC", "access"],
            "modelAnswer": "Assess the design and operating effectiveness of IT general controls over logical access for Northwind's ERP during the audit period, focusing on whether access is provisioned, reviewed, and revoked per policy."
          },
          {
            "id": "scope",
            "label": "Scope",
            "submissionField": "scope",
            "criteria": "Bounds systems, period, and populations in / out of scope.",
            "keywords": ["scope", "period", "system", "population", "application", "ERP"],
            "modelAnswer": "In scope: Northwind ERP production logical access, joiner-mover-leaver tickets, and privileged roles for FY audit period. Out of scope: infrastructure hosting inherited from the CSP common-control provider."
          },
          {
            "id": "riskFocus",
            "label": "Risk focus",
            "submissionField": "riskFocus",
            "criteria": "Names the highest-risk access themes driving procedures.",
            "keywords": ["privileged", "revocation", "SOD", "segregation", "risk", "dormant"],
            "modelAnswer": "Prioritize privileged access accumulation, timely termination/revocation, and segregation-of-duties conflicts between finance posting and access administration."
          },
          {
            "id": "plannedProcedures",
            "label": "Planned procedures",
            "submissionField": "plannedProcedures",
            "criteria": "Describes concrete tests (population, sample, attributes, evidence).",
            "keywords": ["sample", "population", "test", "attribute", "evidence", "exception"],
            "modelAnswer": "Obtain joiner-mover-leaver population; test a risk-based sample for approval evidence, role appropriateness, and revocation within SLA; evaluate exceptions and rate control operating effectiveness."
          }
        ]
      },
      "reviewNext": {
        "title": "Process control sample testing",
        "href": "/tracks/grc",
        "reason": "After the planning memo, practice attribute testing on a control sample so your planned procedures stay executable."
      }
    }$erubric$::jsonb
FROM public.tracks AS tr
WHERE t.track_id = tr.id
  AND tr.slug IN ('grc', 'auditor')
  AND t.ticket_type IN ('audit_planning_memo', 'planning_memo');
