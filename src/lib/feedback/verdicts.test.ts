import { describe, expect, it } from 'vitest';

import { optionVerdict } from '@/lib/feedback/verdicts';

describe('optionVerdict', () => {
  it('classifies TP/FP/FN/TN', () => {
    expect(optionVerdict(true, true)).toBe('true_positive');
    expect(optionVerdict(true, false)).toBe('false_positive');
    expect(optionVerdict(false, true)).toBe('false_negative');
    expect(optionVerdict(false, false)).toBe('true_negative');
  });
});
