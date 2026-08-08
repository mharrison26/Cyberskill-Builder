-- Flagship portfolio items: track capstone highlighted first on public portfolio.
-- Created manually (supabase CLI unavailable in agent environment); timestamp follows
-- existing YYYYMMDDHHMMSS_*.sql convention.

ALTER TABLE public.portfolio_items
  ADD COLUMN IF NOT EXISTS is_flagship boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.portfolio_items.is_flagship IS
  'When true, this item is the track flagship capstone and sorts first on the public portfolio.';

-- At most one flagship per student per track.
CREATE UNIQUE INDEX IF NOT EXISTS portfolio_items_one_flagship_per_student_track
  ON public.portfolio_items (student_id, track_id)
  WHERE is_flagship = true;

CREATE INDEX IF NOT EXISTS portfolio_items_student_public_flagship_idx
  ON public.portfolio_items (student_id, is_flagship DESC, created_at DESC)
  WHERE is_public = true;
