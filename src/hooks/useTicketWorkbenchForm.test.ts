import { describe, expect, it } from 'vitest';

import {
  asSubmissionRecord,
  restoredString,
  restoredStringArray,
  restoredStringSet,
} from '@/hooks/useTicketWorkbenchForm';

describe('useTicketWorkbenchForm restore helpers', () => {
  it('asSubmissionRecord returns empty object for nullish / non-objects', () => {
    expect(asSubmissionRecord(null)).toEqual({});
    expect(asSubmissionRecord(undefined)).toEqual({});
    expect(asSubmissionRecord([])).toEqual({});
  });

  it('restoredString prefers the first matching key', () => {
    const submission = { reply: 'Hello', memo: 'Memo text' };
    expect(restoredString(submission, 'reply')).toBe('Hello');
    expect(restoredString(submission, ['missing', 'memo'])).toBe('Memo text');
    expect(restoredString(null, 'reply', 'fallback')).toBe('fallback');
  });

  it('restoredStringArray and restoredStringSet restore id lists', () => {
    const submission = {
      selectedGapIds: ['gap-1', 'gap-2', 3, ''],
      orderedIds: ['a', 'b'],
    };
    expect(restoredStringArray(submission, 'selectedGapIds')).toEqual([
      'gap-1',
      'gap-2',
    ]);
    expect(restoredStringSet(submission, ['missing', 'orderedIds'])).toEqual(
      new Set(['a', 'b'])
    );
    expect(restoredStringArray(null, 'orderedIds')).toEqual([]);
  });
});
