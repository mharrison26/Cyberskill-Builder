import { describe, expect, it } from 'vitest';

import { buildFreeTextTrainingFeedback } from '@/lib/feedback/buildFreeTextFeedback';

describe('buildFreeTextTrainingFeedback', () => {
  const expectedState = {
    rubric: {
      modelAnswer: 'Overall model memo.',
      dimensions: [
        {
          id: 'objective',
          label: 'Engagement objective',
          submissionField: 'objective',
          criteria: 'States what will be assessed.',
          keywords: ['assess', 'effectiveness', 'access'],
          modelAnswer: 'Assess ITGC operating effectiveness over logical access.',
        },
        {
          id: 'scope',
          label: 'Scope',
          submissionField: 'scope',
          criteria: 'Bounds systems and period.',
          keywords: ['ERP', 'period', 'population'],
          modelAnswer: 'Northwind ERP for the audit period.',
        },
      ],
    },
    reviewNext: {
      title: 'Next lesson',
      href: '/tracks/grc',
      reason: 'Practice sampling next.',
    },
  };

  it('scores dimensions, quotes strengths, and lists omissions', () => {
    const feedback = buildFreeTextTrainingFeedback({
      expectedState,
      status: 'needs_revision',
      summary: 'Memo needs more scope detail.',
      submission: {
        objective:
          'We will assess the operating effectiveness of logical access controls.',
        scope: 'In-scope systems only.',
      },
    });

    expect(feedback).not.toBeNull();
    expect(feedback!.kind).toBe('free_text');
    expect(feedback!.rubric?.dimensions).toHaveLength(2);

    const objective = feedback!.rubric!.dimensions.find(
      (d) => d.id === 'objective'
    )!;
    expect(objective.score).toBeGreaterThan(0);
    expect(objective.strengths.length).toBeGreaterThan(0);
    expect(objective.modelAnswer).toContain('ITGC');

    const scope = feedback!.rubric!.dimensions.find((d) => d.id === 'scope')!;
    expect(scope.omissions.length).toBeGreaterThan(0);
    expect(feedback!.rubric?.modelAnswer).toBe('Overall model memo.');
    expect(feedback!.reviewNext?.href).toBe('/tracks/grc');
  });
});
