import { describe, expect, it, vi } from 'vitest';

import {
  buildDeterministicInfraFollowUpQuestions,
  generateInfraFollowUpQuestionsFromDesignDoc,
  INFRA_FOLLOWUP_QUESTION_MAX,
  INFRA_FOLLOWUP_QUESTION_MIN,
} from '@/lib/infra/generateFollowUpQuestions';

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class Anthropic {
      messages = {
        create: vi.fn(),
      };
    },
  };
});

const designDoc = {
  title: 'Harbor Dental backup topology ADR',
  topologyChoice: '3-2-1 NAS + immutable cloud',
  body: `
I recommend a 3-2-1 backup topology with nightly NAS increments and immutable
cloud copies under a $200/mo budget. Ransomware resilience and one-day image
restore RTO drive the hybrid choice over cloud-only or NAS-only alternatives.
Office manager runs quarterly restore drills with a one-page runbook.
`.trim(),
};

describe('buildDeterministicInfraFollowUpQuestions', () => {
  it('returns 4–5 grounded questions', () => {
    const questions = buildDeterministicInfraFollowUpQuestions(designDoc);
    expect(questions.length).toBeGreaterThanOrEqual(INFRA_FOLLOWUP_QUESTION_MIN);
    expect(questions.length).toBeLessThanOrEqual(INFRA_FOLLOWUP_QUESTION_MAX);
    expect(questions.every((q) => q.id && q.prompt.length > 20)).toBe(true);
    expect(questions.some((q) => /ransomware|topology|budget|restore/i.test(q.prompt))).toBe(
      true
    );
  });
});

describe('generateInfraFollowUpQuestionsFromDesignDoc', () => {
  it('falls back when Anthropic key is missing', async () => {
    const prev = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    const result = await generateInfraFollowUpQuestionsFromDesignDoc(designDoc);

    expect(result.source).toBe('deterministic_fallback');
    expect(result.questions.length).toBeGreaterThanOrEqual(
      INFRA_FOLLOWUP_QUESTION_MIN
    );
    expect(result.retrievedRubricSectionIds.length).toBeGreaterThan(0);

    if (prev === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = prev;
    }
  });
});
