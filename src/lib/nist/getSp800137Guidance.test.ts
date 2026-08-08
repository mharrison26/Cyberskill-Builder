import { describe, expect, it } from 'vitest';

import {
  formatRetrievedSp800137Guidance,
  getSp800137Section,
  listSp800137Sections,
  retrieveSp800137Guidance,
} from './getSp800137Guidance';

describe('getSp800137Guidance', () => {
  it('loads pinned frequency and reporting sections', () => {
    const frequencies = getSp800137Section('establish-frequencies');
    const reporting = getSp800137Section('analyze-report');

    expect(frequencies.title.toLowerCase()).toContain('frequenc');
    expect(frequencies.text.toLowerCase()).toContain('volatility');
    expect(reporting.title.toLowerCase()).toContain('report');
    expect(reporting.text.toLowerCase()).toContain('reporting');
  });

  it('throws when section id is missing', () => {
    expect(() => getSp800137Section('not-a-real-section')).toThrow(
      'SP 800-137 section not found: not-a-real-section'
    );
  });

  it('lists multiple guidance sections from the pinned file', () => {
    const sections = listSp800137Sections();
    expect(sections.length).toBeGreaterThanOrEqual(6);
    expect(sections.some((section) => section.id === 'define-strategy')).toBe(
      true
    );
  });

  it('retrieves core strategy/frequency/reporting sections plus query-relevant text', () => {
    const retrieved = retrieveSp800137Guidance(
      'Volatile configuration management controls need automated daily monitoring; escalate SAR findings to the authorizing official weekly.',
      { topK: 5 }
    );

    const ids = retrieved.sections.map((section) => section.id);
    expect(ids).toContain('define-strategy');
    expect(ids).toContain('establish-frequencies');
    expect(ids).toContain('analyze-report');
    expect(retrieved.catalogPath).toContain('sp800-137');

    const formatted = formatRetrievedSp800137Guidance(retrieved);
    expect(formatted).toContain('### define-strategy');
    expect(formatted).toContain('### establish-frequencies');
  });
});
