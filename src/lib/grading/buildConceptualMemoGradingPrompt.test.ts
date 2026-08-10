import { describe, expect, it } from 'vitest';

import { buildConceptualMemoGradingPrompt } from '@/lib/grading/buildConceptualMemoGradingPrompt';

describe('buildConceptualMemoGradingPrompt', () => {
  it('includes scenario, rubric, and memo without inventing framework text', () => {
    const prompt = buildConceptualMemoGradingPrompt({
      lessonTitle: 'Core Framework Differences',
      scenarioBrief: 'Draft a one-page orientation memo.',
      gradingFocus: 'Distinguish voluntary commercial vs mandatory federal frameworks.',
      memo: 'Commercial frameworks are attestation-based; RMF is authorization-based.',
    });

    expect(prompt).toContain('Core Framework Differences');
    expect(prompt).toContain('Draft a one-page orientation memo.');
    expect(prompt).toContain(
      'Distinguish voluntary commercial vs mandatory federal frameworks.'
    );
    expect(prompt).toContain(
      'Commercial frameworks are attestation-based; RMF is authorization-based.'
    );
    expect(prompt).toContain('authoring rubric');
  });
});
