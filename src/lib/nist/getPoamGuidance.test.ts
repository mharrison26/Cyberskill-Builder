import { describe, expect, it } from 'vitest';

import {
  formatRetrievedPoamGuidance,
  getPoamGuidanceSection,
  listPoamGuidanceSections,
  retrievePoamGuidance,
} from './getPoamGuidance';

describe('getPoamGuidance', () => {
  it('loads pinned milestone and schedule sections', () => {
    const milestone = getPoamGuidanceSection('milestone-quality');
    const schedule = getPoamGuidanceSection('scheduled-completion');

    expect(milestone.title.toLowerCase()).toContain('milestone');
    expect(milestone.text.toLowerCase()).toContain('actionable');
    expect(schedule.text.toLowerCase()).toContain('completion');
  });

  it('retrieves core POA&M sections plus query-relevant text', () => {
    const retrieved = retrievePoamGuidance(
      'Implement quarterly privileged access reviews with signed evidence by a realistic completion date.',
      { topK: 4 }
    );

    const ids = retrieved.sections.map((section) => section.id);
    expect(ids).toContain('poam-purpose');
    expect(ids).toContain('milestone-quality');
    expect(ids).toContain('scheduled-completion');
    expect(retrieved.catalogPath).toContain('poam-remediation');

    const formatted = formatRetrievedPoamGuidance(retrieved);
    expect(formatted).toContain('### milestone-quality');
  });

  it('lists multiple guidance sections from the pinned file', () => {
    const sections = listPoamGuidanceSections();
    expect(sections.length).toBeGreaterThanOrEqual(4);
  });
});
