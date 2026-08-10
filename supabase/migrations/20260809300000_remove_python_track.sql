-- Remove the Python Engineering learning track from the product.
--
-- Tickets/lessons/engagements previously parked on `python` (notably
-- scripting_lab stale-login labs) are reassigned to `sysadmin` so curriculum
-- is not lost. Student enrollments for the python track are deleted.
-- Portfolio / POA&M / defense / finding rows that pointed at the track are
-- reassigned to sysadmin so FK RESTRICT does not block track deletion.

DO $$
DECLARE
  python_id uuid;
  sysadmin_id uuid;
BEGIN
  SELECT id INTO python_id FROM public.tracks WHERE slug = 'python';
  IF python_id IS NULL THEN
    RAISE NOTICE 'python track already absent; nothing to do';
    RETURN;
  END IF;

  SELECT id INTO sysadmin_id FROM public.tracks WHERE slug = 'sysadmin';

  IF sysadmin_id IS NOT NULL THEN
    UPDATE public.tickets
    SET track_id = sysadmin_id
    WHERE track_id = python_id;

    UPDATE public.engagements
    SET track_id = sysadmin_id
    WHERE track_id = python_id;

    UPDATE public.lessons
    SET track_id = sysadmin_id
    WHERE track_id = python_id;

    UPDATE public.portfolio_items
    SET track_id = sysadmin_id
    WHERE track_id = python_id;

    UPDATE public.poam_items
    SET track_id = sysadmin_id
    WHERE track_id = python_id;

    UPDATE public.defense_recordings
    SET track_id = sysadmin_id
    WHERE track_id = python_id;

    UPDATE public.oscal_findings
    SET track_id = sysadmin_id
    WHERE track_id = python_id;
  ELSE
    -- No sysadmin fallback: drop track-scoped content, then the track.
    DELETE FROM public.ticket_progress
    WHERE ticket_id IN (
      SELECT id FROM public.tickets WHERE track_id = python_id
    );

    DELETE FROM public.sandbox_sessions
    WHERE ticket_id IN (
      SELECT id FROM public.tickets WHERE track_id = python_id
    );

    DELETE FROM public.portfolio_items WHERE track_id = python_id;
    DELETE FROM public.poam_items WHERE track_id = python_id;
    DELETE FROM public.defense_recordings WHERE track_id = python_id;
    DELETE FROM public.oscal_findings WHERE track_id = python_id;
    DELETE FROM public.tickets WHERE track_id = python_id;
    DELETE FROM public.engagements WHERE track_id = python_id;
    DELETE FROM public.lessons WHERE track_id = python_id;
  END IF;

  DELETE FROM public.track_enrollments WHERE track_id = python_id;
  DELETE FROM public.tracks WHERE id = python_id;
END $$;
