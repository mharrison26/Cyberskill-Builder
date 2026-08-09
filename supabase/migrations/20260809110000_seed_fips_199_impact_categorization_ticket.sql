-- Seed FIPS 199 impact categorization ticket (GRC track).
--
-- Students categorize a fictional information system:
--   - assign Low / Moderate / High for confidentiality, integrity, availability
--   - set overall to the high-water mark
--   - justify using system data types + mission impact
-- Deterministic: levels scored against seeded answer key.
-- RAG: justification graded against pinned FIPS 199 educational excerpts.
--
-- How to create / customize this ticket content:
--   1. Admin → Tickets → create or edit ticket_type = fips_199_impact_categorization
--   2. Put the fictional system profile in initial_state.systemProfile
--   3. Put the answer key in expected_state:
--        confidentiality, integrity, availability, overall,
--        minJustificationLength, guidanceTopics, topKGuidanceSections
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
  AND t.ticket_type IN (
    'fips_199_impact_categorization',
    'impact_categorization',
    'security_categorization'
  )
  AND t.scenario_brief LIKE 'FIPS 199:%';

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
  'fips_199_impact_categorization',
  'medium',
  45,
  'FIPS 199: Categorize RiverWatch Flood Decision Support for C/I/A and overall high-water mark',
  jsonb_build_object(
    'ticketCode', 'GRC-FIPS199',
    'prompt', 'Assign FIPS 199 potential impact levels (Low / Moderate / High) for confidentiality, integrity, and availability for RiverWatch. Set the overall system category to the high-water mark of those three values. Justify each selection using the information types and mission consequences below — reference limited vs serious vs severe/catastrophic adverse effects.',
    'systemProfile', jsonb_build_object(
      'name', 'RiverWatch Flood Decision Support System',
      'description', 'Statewide web application used by the State Emergency Management Agency (SEMA) and 12 county emergency managers to fuse river gauge telemetry, forecast products, and evacuation planning data during flood season. RiverWatch is the primary decision-support console for watch/warning recommendations; it is not a weapons or national-security system.',
      'mission', 'Primary functions: (1) maintain situational awareness of river stages across the basin, (2) recommend watch/warning and evacuation-zone actions to county EMAs, and (3) push contact lists for zone notification. Wrong evacuate / do-not-evacuate guidance during a crest event can put residents in harm''s way. Multi-hour loss of the console significantly slows coordinated warning decisions across counties.',
      'environment', 'AWS commercial region; Entra ID workforce SSO; public agency network; interfaces to USGS-style gauge feeds and a state GIS service for zone polygons.',
      'fallbackNotes', 'Counties can fall back to raw gauge websites, NOAA products, and phone trees for several hours, but coordination quality and speed degrade significantly without RiverWatch. There is no automatic alternate console with the same fused evacuation contact data.',
      'dataTypes', jsonb_build_array(
        jsonb_build_object(
          'id', 'gauge-telemetry',
          'name', 'Public river gauge telemetry',
          'notes', 'Near-real-time stage and discharge readings. Largely public scientific data; unauthorized disclosure has limited adverse effect. Unauthorized modification could drive wrong flood decisions.'
        ),
        jsonb_build_object(
          'id', 'forecast-products',
          'name', 'Hydrologic forecast and crest products',
          'notes', 'Model outputs and analyst notes used to time watches/warnings. Integrity failures can cause missed or premature evacuations with life-safety consequences.'
        ),
        jsonb_build_object(
          'id', 'evac-maps',
          'name', 'Evacuation zone maps and go/no-go overlays',
          'notes', 'Authoritative polygons and decision overlays used by county EMAs. Corruption or unauthorized change can produce severe/catastrophic harm to individuals (wrong zone guidance during a crest).'
        ),
        jsonb_build_object(
          'id', 'resident-pii',
          'name', 'Resident contact lists for evacuation zones (PII)',
          'notes', 'Names, addresses, and phone numbers for targeted notification. Unauthorized disclosure would cause serious privacy harm and possible targeting risk, but is not itself a catastrophic national-security loss.'
        ),
        jsonb_build_object(
          'id', 'ops-status',
          'name', 'Dam and levee operational status notes',
          'notes', 'Internal ops status used for mission timing. Mixed sensitivity; integrity and availability matter more than confidentiality for most fields.'
        )
      )
    )
  ),
  jsonb_build_object(
    'confidentiality', 'moderate',
    'integrity', 'high',
    'availability', 'moderate',
    'overall', 'high',
    'minJustificationLength', 80,
    'guidanceTopics', jsonb_build_array(
      'security-objectives',
      'impact-definitions',
      'high-water-mark',
      'information-types',
      'justification-quality'
    ),
    'topKGuidanceSections', 5
  ),
  '612',
  COALESCE(
    (
      SELECT MAX(tk.sort_order) + 1
      FROM public.tickets tk
      WHERE tk.track_id = grc.track_id
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
