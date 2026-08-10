-- Seed a Tier 2 vendor_risk_rating ticket on the GRC track.
-- Pedagogical twist: questionnaire looks decent (SOC 2 Type II, older minor
-- breach, MFA/encryption) BUT access criticality is high (production PII/
-- financial ETL with read-write warehouse API, low replaceability).
-- Correct ratings: high or critical — not low/moderate from questionnaire alone.
--
-- ticket_type: vendor_risk_rating
-- aliases: third_party_risk_rating, scrm_vendor_assessment
-- Scoring: deterministic rating band + theme keywords; RAG/LLM vs SP 800-161.
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
  'vendor_risk_rating',
  'medium',
  45,
  $brief$
Vendor risk rating: Rate NimbusData Analytics for HarborForge — questionnaire looks decent (SOC 2 Type II, limited breach history) but access criticality is high (production PII/financial ETL, read-write warehouse API, low replaceability). Apply SP 800-161 C-SCRM; do not rate Low/Moderate from questionnaire hygiene alone.
$brief$,
  $initial${
    "ticketCode": "GRC-VENDOR-SCRM",
    "prompt": "Assign a vendor risk rating (Low/Moderate/High/Critical) and justify using SP 800-161 SCRM-oriented criteria. Account for criticality of the vendor's access, not only questionnaire responses.",
    "organization": {
      "name": "HarborForge Payments",
      "system": "prod-analytics-warehouse (monthly reporting + fraud detection pipelines)"
    },
    "vendor": {
      "name": "NimbusData Analytics LLC",
      "service": "Cloud analytics / ETL into the production data warehouse — ingests transaction and customer attributes, builds reporting models, and writes curated tables used by finance and fraud detection.",
      "accessCriticality": {
        "dataClasses": ["PII", "financial"],
        "privilegeLevel": "read-write API to production data warehouse (service account with broad schema write; can create/overwrite curated fraud and finance tables)",
        "businessImpact": "Pipeline outage or integrity failure blocks monthly regulatory reporting and degrades real-time fraud detection for card-not-present transactions.",
        "replaceability": "low — estimated 9-month switching cost; models and ETL jobs are vendor-specific with limited internal runbooks"
      }
    },
    "questionnaire": {
      "soc2": {
        "status": "Type II",
        "periodEnd": "2025-09-30",
        "exceptions": "One minor change-management exception (emergency change without secondary approval) closed within the period; no open qualifications."
      },
      "subprocessors": [
        {
          "name": "Cascade Hosting",
          "location": "Primary US-East; failover region in APAC with local ops staff",
          "role": "Infrastructure hosting with access to encrypted production data volumes during break-glass support"
        },
        {
          "name": "Lattice Label AI",
          "location": "EU + contractors in a higher-risk jurisdiction for overflow labeling",
          "role": "ML labeling assistance; receives sampled customer-attribute features (includes PII-derived fields)"
        },
        {
          "name": "ParcelNotify",
          "location": "US",
          "role": "Transactional email for job-failure alerts (ops metadata only)"
        }
      ],
      "breachHistory": [
        {
          "year": 2022,
          "summary": "Misconfigured object-storage bucket briefly exposed non-production metadata (job names, timestamps). Contained within 48 hours; no confirmed customer PII exfiltration. No incidents reported 2023–2025."
        }
      ],
      "otherControls": {
        "encryptionAtRest": true,
        "encryptionInTransit": true,
        "mfaRequired": true,
        "backgroundChecks": true,
        "penetrationTestAnnual": true,
        "bugBounty": false
      }
    },
    "ratingScale": ["low", "moderate", "high", "critical"],
    "minJustificationLength": 200
  }$initial$::jsonb,
  $expected${
    "acceptableRatings": ["high", "critical"],
    "preferredRating": "high",
    "minJustificationLength": 200,
    "requiredJustificationThemes": [
      "access_criticality",
      "inherent_risk",
      "scrm"
    ],
    "guidanceTopics": [
      "c-scrm-overview",
      "inherent-vs-residual",
      "access-criticality",
      "questionnaire-limits",
      "subprocessors-supply-chain",
      "rating-justification-quality"
    ],
    "topKGuidanceSections": 6,
    "rejectQuestionnaireOnlyLowRatings": true
  }$expected$::jsonb,
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
        'vendor_risk_rating',
        'third_party_risk_rating',
        'scrm_vendor_assessment'
      )
      AND (
        existing.initial_state->>'ticketCode' = 'GRC-VENDOR-SCRM'
        OR existing.scenario_brief LIKE 'Vendor risk rating: Rate NimbusData%'
      )
  );
