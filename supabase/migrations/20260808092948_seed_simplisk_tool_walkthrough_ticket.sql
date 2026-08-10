-- Seed SimpleRisk tool-walkthrough ticket (GRC-02 / GRC track).
--
-- Students assess a Northwind SaaS vendor scenario with SP 800-30, log the
-- risk in a self-hosted SimpleRisk instance, then submit:
--   - risk register entry ID (deterministic format check)
--   - likelihood/impact justification (RAG-graded vs pinned SP 800-30 text)
--
-- Vendor profile facts (scenario data):
--   - data types: customer PII
--   - integration: REST API with OAuth
--   - vendor posture: SOC 2 Type I only, no penetration test history
--
-- toolUrl default:
--   http://localhost — official SimpleRisk Docker publish on host port 80:
--     docker pull simplerisk/simplerisk
--     docker run --name simplerisk -d -p 80:80 -p 443:443 simplerisk/simplerisk
--   Docs: https://www.simplerisk.com/download/docker
--   Override per cohort via Admin → Tickets (initial_state.toolUrl) or
--   NEXT_PUBLIC_SIMPLERISK_URL (UI fallback when initial_state.toolUrl is empty).
--
-- How to create / customize this ticket content:
--   1. Admin → Tickets → create or edit a ticket with ticket_type = tool_walkthrough
--      (aliases: simplerisk_walkthrough, simplerisk)
--   2. Set initial_state.toolUrl to your self-hosted SimpleRisk base URL
--   3. Adjust initial_state.steps / vendor profile for your lab scenario
--   4. Optional expected_state knobs:
--        riskIdPattern, minJustificationLength, guidanceTopics, topKGuidanceSections
--
-- Idempotent: deletes prior seed rows by stable scenario_brief marker per tenant.

-- Commercial + DoD-adjacent tenants (stable UUIDs from 0002 / 0020)
DELETE FROM public.tickets
WHERE tenant_id IN (
    '00000000-0000-4000-8000-000000000001'::uuid,
    '00000000-0000-4000-8000-000000000003'::uuid
  )
  AND track_id = (SELECT id FROM public.tracks WHERE slug = 'grc')
  AND ticket_type IN ('tool_walkthrough', 'simplerisk_walkthrough', 'simplerisk')
  AND scenario_brief LIKE 'SimpleRisk:%';

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
  'tool_walkthrough',
  'medium',
  45,
  $brief$SimpleRisk: Northwind is onboarding a new SaaS vendor that will have API access to customer PII. Conduct a risk assessment using SP 800-30 methodology: identify at least two threat sources, estimate likelihood and impact using 800-30's qualitative scale, and log the resulting risk in SimpleRisk with a documented rationale.$brief$,
  $initial${
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
  $expected${
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
  '612',
  20
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
