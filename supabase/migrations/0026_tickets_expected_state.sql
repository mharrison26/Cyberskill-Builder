-- Add expected_state ruleset for deterministic config-diff scoring (PI-03).

ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS expected_state jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.tickets.expected_state IS
  'Deterministic scoring ruleset for config remediation: { rules: [...], passThresholdPercent?: number }. Empty object means no rules configured.';
