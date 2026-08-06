-- Seed GRC (Governance, Risk, and Compliance) learning track.

INSERT INTO public.tracks (slug, name, full_price)
VALUES ('grc', 'GRC', 299.00)
ON CONFLICT (slug) DO NOTHING;
