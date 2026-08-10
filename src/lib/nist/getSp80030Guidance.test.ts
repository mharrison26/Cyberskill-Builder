import { describe, expect, it } from 'vitest';

import {
  formatRetrievedSp80030Guidance,
  getSp80030Section,
  listSp80030Sections,
  retrieveSp80030Guidance,
} from './getSp80030Guidance';

describe('getSp80030Guidance', () => {
  it('loads pinned likelihood and impact sections', () => {
    const likelihood = getSp80030Section('likelihood');
    const impact = getSp80030Section('impact');

    expect(likelihood.title.toLowerCase()).toContain('likelihood');
    expect(likelihood.text.toLowerCase()).toContain('probability');
    expect(impact.title.toLowerCase()).toContain('impact');
    expect(impact.text.toLowerCase()).toContain('magnitude of harm');
  });

  it('throws when section id is missing', () => {
    expect(() => getSp80030Section('not-a-real-section')).toThrow(
      'SP 800-30 section not found: not-a-real-section'
    );
  });

  it('lists multiple guidance sections from the pinned file', () => {
    const sections = listSp80030Sections();
    expect(sections.length).toBeGreaterThanOrEqual(4);
    expect(
      sections.some((section) => section.id === 'risk-determination')
    ).toBe(true);
    expect(sections.some((section) => section.id === 'threat-sources')).toBe(
      true
    );
  });

  it('pins threat-sources when required for GRC-02-style retrieval', () => {
    const retrieved = retrieveSp80030Guidance(
      'identify threat sources for SaaS vendor API access to customer PII',
      {
        topK: 5,
        requiredSectionIds: [
          'threat-sources',
          'likelihood',
          'impact',
          'risk-determination',
        ],
      }
    );
    const ids = retrieved.sections.map((section) => section.id);
    expect(ids).toContain('threat-sources');
    expect(ids).toContain('likelihood');
    expect(retrieved.catalogPath).toContain(
      'sp800-30-risk-assessment-guidance.json'
    );
  });

  it('retrieves core likelihood/impact sections plus query-relevant text', () => {
    const retrieved = retrieveSp80030Guidance(
      'Adversary capability and intent make exploitation likely; confidentiality loss harms the mission and regulated individuals.',
      { topK: 4 }
    );

    const ids = retrieved.sections.map((section) => section.id);
    expect(ids).toContain('likelihood');
    expect(ids).toContain('impact');
    expect(ids).toContain('risk-determination');
    expect(retrieved.catalogPath).toContain('sp800-30');

    const formatted = formatRetrievedSp80030Guidance(retrieved);
    expect(formatted).toContain('### likelihood');
    expect(formatted).toContain('### impact');
  });
});
