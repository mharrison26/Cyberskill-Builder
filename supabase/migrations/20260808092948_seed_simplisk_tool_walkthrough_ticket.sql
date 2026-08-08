-- Seed SimpleRisk tool-walkthrough ticket (GRC track).
--
-- Students log a risk in a self-hosted SimpleRisk instance, then submit:
--   - risk register entry ID (deterministic format check)
--   - likelihood/impact justification (RAG-graded vs pinned SP 800-30 text)
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
--   3. Adjust initial_state.steps for your lab scenario
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
  'SimpleRisk: Log exposed remote administration risk and justify likelihood/impact',
  jsonb_build_object(
    'toolName', 'SimpleRisk',
    'toolUrl', 'http://localhost',
    'toolHint', 'Use the self-hosted SimpleRisk instance for this lab (default http://localhost). Start it with: docker run --name simplerisk -d -p 80:80 -p 443:443 simplerisk/simplerisk. Your instructor may share a different cohort URL.',
    'steps', jsonb_build_array(
      jsonb_build_object(
        'title', 'Sign in',
        'body', 'Open SimpleRisk and sign in with the credentials provided for your cohort.'
      ),
      jsonb_build_object(
        'title', 'Submit a risk',
        'body', 'Create a new risk for internet-exposed remote administration (for example RDP/SSH) on a system that stores sensitive operational data. Include a clear subject and description.'
      ),
      jsonb_build_object(
        'title', 'Set likelihood and impact',
        'body', 'Assign likelihood and impact values in SimpleRisk using factors you can defend (threat capability/intent or non-adversarial frequency, control gaps, and magnitude of harm to mission/assets/individuals).'
      ),
      jsonb_build_object(
        'title', 'Record the risk ID',
        'body', 'After the risk is saved, copy the risk register entry ID shown in SimpleRisk. You will submit that ID plus a written likelihood/impact justification in this ticket.'
      )
    )
  ),
  jsonb_build_object(
    'riskIdPattern', '^(?:RISK[-_:]?)?\d{1,10}$',
    'minJustificationLength', 80,
    'guidanceTopics', jsonb_build_array(
      'likelihood',
      'impact',
      'risk-determination'
    ),
    'topKGuidanceSections', 4
  ),
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
