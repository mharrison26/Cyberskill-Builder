-- GRC-02: populate SimpleRisk tool_walkthrough ticket with Northwind vendor
-- profile (customer PII; REST API with OAuth; SOC 2 Type I only, no pen test)
-- and SP 800-30 RAG guidance topics (threat-sources + likelihood/impact).
--
-- Idempotent UPDATE of existing SimpleRisk:% seed rows (does not re-insert).

UPDATE public.tickets
SET
  scenario_brief = $brief$SimpleRisk: Northwind is onboarding a new SaaS vendor that will have API access to customer PII. Conduct a risk assessment using SP 800-30 methodology: identify at least two threat sources, estimate likelihood and impact using 800-30's qualitative scale, and log the resulting risk in SimpleRisk with a documented rationale.$brief$,
  initial_state = $initial${
    "ticketCode": "GRC-02",
    "toolName": "SimpleRisk",
    "toolUrl": "http://localhost",
    "toolHint": "Use the self-hosted SimpleRisk instance for this lab (default http://localhost). Start it with: docker run --name simplerisk -d -p 80:80 -p 443:443 simplerisk/simplerisk. Your instructor may share a different cohort URL.",
    "organization": {
      "name": "Northwind"
    },
    "vendor": {
      "dataTypes": ["customer PII"],
      "integration": "REST API with OAuth",
      "posture": {
        "soc2": "Type I only",
        "penetrationTestHistory": "none"
      },
      "postureSummary": "SOC 2 Type I only, no penetration test history"
    },
    "steps": [
      {
        "title": "Review the vendor profile",
        "body": "Northwind is onboarding a SaaS vendor with API access to customer PII. Note the integration (REST API with OAuth) and stated posture (SOC 2 Type I only; no penetration test history)."
      },
      {
        "title": "Sign in to SimpleRisk",
        "body": "Open SimpleRisk and sign in with the credentials provided for your cohort."
      },
      {
        "title": "Submit a risk",
        "body": "Create a new risk for this vendor onboarding scenario. Identify at least two threat sources, and include a clear subject and description that reflects the PII / API exposure and posture gaps."
      },
      {
        "title": "Set likelihood and impact",
        "body": "Assign likelihood and impact in SimpleRisk using SP 800-30 qualitative factors you can defend (threat capability/intent or non-adversarial frequency, control gaps such as Type I-only assurance and missing pen-test evidence, and magnitude of harm to customer PII / mission)."
      },
      {
        "title": "Record the risk ID",
        "body": "After the risk is saved, copy the risk register entry ID shown in SimpleRisk. You will submit that ID plus a written likelihood/impact justification in this ticket."
      }
    ]
  }$initial$::jsonb,
  expected_state = $expected${
    "riskIdPattern": "^(?:RISK[-_:]?)?\\d{1,10}$",
    "minJustificationLength": 80,
    "guidanceTopics": [
      "threat-sources",
      "likelihood",
      "impact",
      "risk-determination"
    ],
    "topKGuidanceSections": 5
  }$expected$::jsonb,
  tier = 2,
  difficulty = 'medium',
  sla_minutes = 45,
  dcwf_code = '612'
WHERE tenant_id IN (
    '00000000-0000-4000-8000-000000000001'::uuid,
    '00000000-0000-4000-8000-000000000003'::uuid
  )
  AND track_id = (SELECT id FROM public.tracks WHERE slug = 'grc')
  AND ticket_type IN ('tool_walkthrough', 'simplerisk_walkthrough', 'simplerisk')
  AND scenario_brief LIKE 'SimpleRisk:%';
