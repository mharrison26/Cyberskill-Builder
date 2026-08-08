import { describe, expect, it } from 'vitest';

import {
  formatRetrievedSecMaterialityGuidance,
  getSecMaterialitySection,
  listSecMaterialitySections,
  retrieveSecMaterialityGuidance,
} from './getSecMaterialityGuidance';

describe('getSecMaterialityGuidance', () => {
  it('loads pinned reasonable-investor and rule-overview sections', () => {
    const investor = getSecMaterialitySection('reasonable-investor');
    const overview = getSecMaterialitySection('rule-overview');

    expect(investor.title.toLowerCase()).toContain('reasonable investor');
    expect(investor.text.toLowerCase()).toContain('reasonable investor');
    expect(overview.text.toLowerCase()).toContain('four business days');
    expect(overview.text.toLowerCase()).toContain('item 1.05');
  });

  it('throws when section id is missing', () => {
    expect(() => getSecMaterialitySection('not-a-real-section')).toThrow(
      'SEC materiality section not found: not-a-real-section'
    );
  });

  it('lists materiality factor sections from the pinned file', () => {
    const sections = listSecMaterialitySections();
    expect(sections.length).toBeGreaterThanOrEqual(6);
    expect(sections.some((section) => section.id === 'financial-impact')).toBe(
      true
    );
    expect(sections.some((section) => section.id === 'data-compromise')).toBe(
      true
    );
  });

  it('retrieves core factor sections for a memo-style query', () => {
    const retrieved = retrieveSecMaterialityGuidance(
      'Ransomware disrupted order systems; customer PII exfiltrated; remediation costs and litigation risk make the incident material for a reasonable investor within four business days.',
      { topK: 8 }
    );

    const ids = retrieved.sections.map((section) => section.id);
    expect(ids).toContain('reasonable-investor');
    expect(ids).toContain('rule-overview');
    expect(ids).toContain('financial-impact');
    expect(retrieved.catalogPath).toContain(
      'cybersecurity-disclosure-materiality'
    );
    expect(retrieved.disclaimer?.toLowerCase()).toContain('not legal advice');

    const formatted = formatRetrievedSecMaterialityGuidance(retrieved);
    expect(formatted).toContain('### reasonable-investor');
    expect(formatted).toContain('### rule-overview');
  });
});
