-- Admins manage tickets via RLS (0022), but table privileges were SELECT-only.
-- Extend grants so authenticated admins can INSERT/UPDATE/DELETE through Data API.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tickets TO authenticated;
