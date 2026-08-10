-- Prevent same-tenant standalone ticket scenario duplication.
--
-- Natural key for standalone tickets (engagement_id IS NULL) is
-- (tenant_id, track_id, ticket_type) — the same triple seed scripts guard
-- with NOT EXISTS. Engagement-stage tickets may reuse ticket_type and are
-- already uniquely constrained by (engagement_id, engagement_stage).
--
-- Cross-tenant copies of the same scenario are intentional (Commercial vs
-- DoD Adjacent). Console loaders must filter by the viewer's tenant_id.

-- ---------------------------------------------------------------------------
-- 1) Collapse any same-tenant standalone duplicates, keeping progress
-- ---------------------------------------------------------------------------
WITH keepers AS (
  SELECT DISTINCT ON (t.tenant_id, t.track_id, t.ticket_type)
    t.id,
    t.tenant_id,
    t.track_id,
    t.ticket_type
  FROM public.tickets AS t
  WHERE t.engagement_id IS NULL
  ORDER BY
    t.tenant_id,
    t.track_id,
    t.ticket_type,
    (SELECT COUNT(*)::int FROM public.ticket_progress AS tp WHERE tp.ticket_id = t.id) DESC,
    (SELECT COUNT(*)::int FROM public.portfolio_items AS pi WHERE pi.ticket_id = t.id) DESC,
    (SELECT COUNT(*)::int FROM public.poam_items AS pm WHERE pm.ticket_id = t.id) DESC,
    t.id ASC
),
losers AS (
  SELECT
    t.id AS loser_id,
    k.id AS winner_id
  FROM public.tickets AS t
  INNER JOIN keepers AS k
    ON k.tenant_id = t.tenant_id
   AND k.track_id = t.track_id
   AND k.ticket_type = t.ticket_type
  WHERE t.engagement_id IS NULL
    AND t.id <> k.id
),
-- Drop loser progress when the student already has a row on the keeper.
_drop_dup_progress AS (
  DELETE FROM public.ticket_progress AS tp
  USING losers AS l
  WHERE tp.ticket_id = l.loser_id
    AND EXISTS (
      SELECT 1
      FROM public.ticket_progress AS keep
      WHERE keep.ticket_id = l.winner_id
        AND keep.student_id = tp.student_id
    )
  RETURNING tp.id
),
_move_progress AS (
  UPDATE public.ticket_progress AS tp
  SET ticket_id = l.winner_id
  FROM losers AS l
  WHERE tp.ticket_id = l.loser_id
  RETURNING tp.id
),
_drop_dup_portfolio AS (
  DELETE FROM public.portfolio_items AS pi
  USING losers AS l
  WHERE pi.ticket_id = l.loser_id
    AND EXISTS (
      SELECT 1
      FROM public.portfolio_items AS keep
      WHERE keep.ticket_id = l.winner_id
        AND keep.student_id = pi.student_id
    )
  RETURNING pi.id
),
_move_portfolio AS (
  UPDATE public.portfolio_items AS pi
  SET ticket_id = l.winner_id
  FROM losers AS l
  WHERE pi.ticket_id = l.loser_id
  RETURNING pi.id
),
_drop_dup_poam AS (
  DELETE FROM public.poam_items AS pm
  USING losers AS l
  WHERE pm.ticket_id = l.loser_id
    AND EXISTS (
      SELECT 1
      FROM public.poam_items AS keep
      WHERE keep.ticket_id = l.winner_id
        AND keep.student_id = pm.student_id
        AND keep.finding_id IS NOT DISTINCT FROM pm.finding_id
    )
  RETURNING pm.id
),
_move_poam AS (
  UPDATE public.poam_items AS pm
  SET ticket_id = l.winner_id
  FROM losers AS l
  WHERE pm.ticket_id = l.loser_id
  RETURNING pm.id
),
_move_sandbox AS (
  UPDATE public.sandbox_sessions AS ss
  SET ticket_id = l.winner_id
  FROM losers AS l
  WHERE ss.ticket_id = l.loser_id
  RETURNING ss.id
)
DELETE FROM public.tickets AS t
USING losers AS l
WHERE t.id = l.loser_id;

-- ---------------------------------------------------------------------------
-- 2) Enforce uniqueness going forward
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS tickets_tenant_track_type_standalone_unique
  ON public.tickets (tenant_id, track_id, ticket_type)
  WHERE engagement_id IS NULL;

COMMENT ON INDEX public.tickets_tenant_track_type_standalone_unique IS
  'Standalone ticket scenarios are unique per tenant + track + ticket_type. Engagement stages may reuse ticket_type and use tickets_engagement_id_stage_unique instead.';
