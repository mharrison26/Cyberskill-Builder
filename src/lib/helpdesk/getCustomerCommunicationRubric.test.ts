import { describe, expect, it } from 'vitest';

import {
  formatRetrievedCustomerCommunicationRubric,
  getCustomerCommunicationRubricSection,
  listCustomerCommunicationRubricSections,
  retrieveCustomerCommunicationRubric,
} from './getCustomerCommunicationRubric';

describe('getCustomerCommunicationRubric', () => {
  it('loads pinned acknowledge and next-steps sections', () => {
    const acknowledge = getCustomerCommunicationRubricSection(
      'acknowledge-frustration'
    );
    const nextSteps = getCustomerCommunicationRubricSection('state-next-steps');

    expect(acknowledge.text.toLowerCase()).toContain('frustration');
    expect(nextSteps.text.toLowerCase()).toContain('next');
  });

  it('throws when section id is missing', () => {
    expect(() =>
      getCustomerCommunicationRubricSection('not-a-real-section')
    ).toThrow('Customer communication rubric section not found');
  });

  it('lists all four rubric criteria from the pinned file', () => {
    const sections = listCustomerCommunicationRubricSections();
    expect(sections).toHaveLength(4);
    const ids = sections.map((section) => section.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'acknowledge-frustration',
        'state-next-steps',
        'avoid-jargon',
        'professional-tone',
      ])
    );
  });

  it('always pins all four criteria for a reply-style query', () => {
    const retrieved = retrieveCustomerCommunicationRubric(
      'Sorry for the wait; I will unlock your account and send a reset link today.'
    );

    const ids = retrieved.sections.map((section) => section.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'acknowledge-frustration',
        'state-next-steps',
        'avoid-jargon',
        'professional-tone',
      ])
    );
    expect(retrieved.catalogPath).toContain('customer-communication-rubric');
    expect(retrieved.disclaimer?.toLowerCase()).toContain('educational');

    const formatted = formatRetrievedCustomerCommunicationRubric(retrieved);
    expect(formatted).toContain('### acknowledge-frustration');
    expect(formatted).toContain('### professional-tone');
  });
});
