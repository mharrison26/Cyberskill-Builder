-- Align Evidence Collection & Validation with the other Tier 1 GRC lessons.
-- Original seed used sort_order-as-tier (1/2/3/4); later content seeds set the
-- other three to tier='1' but left this lesson at tier='3'.

UPDATE public.lessons AS l
SET tier = '1'
FROM public.tracks AS t
WHERE l.track_id = t.id
  AND t.slug = 'grc'
  AND l.title = 'Evidence Collection & Validation'
  AND l.tier IS DISTINCT FROM '1';
