-- Extend free-text rubric backfill to auditor-track planning memos
-- (PI-02 HarborForge engagement seeds audit_planning_memo on slug=auditor).

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
