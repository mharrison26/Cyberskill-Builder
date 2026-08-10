import { describe, expect, it } from 'vitest';

import { buildChecklistTrainingFeedback } from '@/lib/feedback/buildChecklistFeedback';

describe('buildChecklistTrainingFeedback', () => {
  it('builds TP/FP/FN options with rationales and control links', () => {
    const feedback = buildChecklistTrainingFeedback({
      scorePercent: 50,
      status: 'needs_revision',
      summary: 'Partial credit on SSP gaps.',
      expectedState: {
        reviewNext: {
          title: 'AC-6 Least Privilege',
          href: '/tracks/grc/catalog?q=AC-6',
          reason: 'Review least privilege.',
        },
      },
      options: [
        {
          optionId: 'gap-missing-ac-6',
          label: 'Missing AC-6 (Least Privilege)',
          selected: true,
          shouldSelect: true,
          rationale: 'AC-6 is required for Moderate systems.',
          controlId: 'AC-6',
        },
        {
          optionId: 'distractor-au-2-ok',
          label: 'AU-2 incomplete',
          selected: true,
          shouldSelect: false,
          rationale: 'Distractor — AU-2 already lists event types.',
          controlId: 'AU-2',
        },
        {
          optionId: 'gap-vague-cm-2',
          label: 'Vague CM-2',
          selected: false,
          shouldSelect: true,
          rationale: 'CM-2 narrative is boilerplate.',
          controlId: 'CM-2',
        },
      ],
    });

    expect(feedback.kind).toBe('checklist');
    expect(feedback.checklist?.options).toHaveLength(3);

    const byId = Object.fromEntries(
      feedback.checklist!.options.map((o) => [o.optionId, o])
    );

    expect(byId['gap-missing-ac-6'].verdict).toBe('true_positive');
    expect(byId['distractor-au-2-ok'].verdict).toBe('false_positive');
    expect(byId['gap-vague-cm-2'].verdict).toBe('false_negative');

    expect(byId['gap-missing-ac-6'].rationale).toContain('AC-6');
    expect(byId['gap-missing-ac-6'].control?.controlId).toBe('AC-6');
    expect(byId['gap-missing-ac-6'].control?.catalogHref).toContain('q=AC-6');
    expect(byId['gap-missing-ac-6'].control?.statementExcerpt.length).toBeGreaterThan(
      0
    );

    expect(feedback.reviewNext?.href).toContain('AC-6');
  });
});
