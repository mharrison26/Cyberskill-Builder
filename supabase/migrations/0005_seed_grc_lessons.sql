-- Seed GRC track lessons (idempotent: replace existing GRC lessons by sort_order).

DELETE FROM public.lessons
WHERE track_id = (SELECT id FROM public.tracks WHERE slug = 'grc');

INSERT INTO public.lessons (
  track_id,
  tier,
  lesson_type,
  sort_order,
  title,
  learning_objectives,
  dcwf_code
)
VALUES
  (
    (SELECT id FROM public.tracks WHERE slug = 'grc'),
    '1',
    'conceptual',
    1,
    'Core Framework Differences',
    'Compare the scope, audience, and control structures of major GRC frameworks including NIST RMF, ISO 27001, FedRAMP, and SOC 2. Identify when each framework applies and how organizations map controls across standards to reduce redundant compliance effort.',
    '722'
  ),
  (
    (SELECT id FROM public.tracks WHERE slug = 'grc'),
    '2',
    'conceptual',
    2,
    'Navigating NIST SP 800-53',
    'Navigate the NIST SP 800-53 Rev. 5 catalog hierarchy including control families, baselines, enhancements, and parameters. Locate specific controls and interpret their statements, discussion sections, and related controls to support assessment planning.',
    '722'
  ),
  (
    (SELECT id FROM public.tracks WHERE slug = 'grc'),
    '3',
    'artifact_lab',
    3,
    'Evidence Collection & Validation',
    'Collect, organize, and validate audit evidence that demonstrates control implementation and operating effectiveness. Apply DCWF work role 722 practices to tie artifacts to control objectives and prepare findings suitable for assessor review.',
    '722'
  ),
  (
    (SELECT id FROM public.tracks WHERE slug = 'grc'),
    '4',
    'tool_walkthrough',
    4,
    'Open-Source Tracking Workflows',
    'Evaluate open-source compliance tracking tools and workflows for maintaining control inventories, evidence repositories, and remediation status. Configure a representative OSS stack to track GRC tasks from control assignment through validation.',
    '722'
  );
