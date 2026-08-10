import { describe, expect, it } from 'vitest';

import {
  CONCEPTUAL_MIN_MEMO_LENGTH,
  isConceptualSubmission,
  validateConceptualSubmission,
} from '@/lib/lessons/conceptualValidation';

describe('validateConceptualSubmission', () => {
  it('accepts a memo that meets the minimum length', () => {
    const memo = 'a'.repeat(CONCEPTUAL_MIN_MEMO_LENGTH);
    const result = validateConceptualSubmission({
      type: 'conceptual',
      memo,
      submittedAt: '2026-08-10T00:00:00.000Z',
    });

    expect(result).toEqual({
      ok: true,
      data: {
        type: 'conceptual',
        memo,
        submittedAt: '2026-08-10T00:00:00.000Z',
      },
    });
  });

  it('rejects short memos', () => {
    const result = validateConceptualSubmission({
      type: 'conceptual',
      memo: 'too short',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain(String(CONCEPTUAL_MIN_MEMO_LENGTH));
    }
  });

  it('rejects non-conceptual types', () => {
    const result = validateConceptualSubmission({
      type: 'catalog_lab',
      memo: 'a'.repeat(CONCEPTUAL_MIN_MEMO_LENGTH),
    });
    expect(result.ok).toBe(false);
  });
});

describe('isConceptualSubmission', () => {
  it('narrows conceptual payloads', () => {
    expect(
      isConceptualSubmission({
        type: 'conceptual',
        memo: 'hello',
        submittedAt: '2026-08-10T00:00:00.000Z',
      })
    ).toBe(true);
    expect(isConceptualSubmission({ type: 'catalog_lab' })).toBe(false);
  });
});
