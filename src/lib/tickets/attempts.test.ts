import { describe, expect, it } from 'vitest';

import {
  canStartNewAttempt,
  DEFAULT_TICKET_MAX_ATTEMPTS,
  nextAttemptNumber,
  resolveMaxAttempts,
} from '@/lib/tickets/attempts';

describe('resolveMaxAttempts', () => {
  it('uses the app default when ticket value is nullish', () => {
    expect(resolveMaxAttempts(null)).toBe(DEFAULT_TICKET_MAX_ATTEMPTS);
    expect(resolveMaxAttempts(undefined)).toBe(DEFAULT_TICKET_MAX_ATTEMPTS);
  });

  it('honors configured ticket max attempts', () => {
    expect(resolveMaxAttempts(5)).toBe(5);
  });
});

describe('canStartNewAttempt', () => {
  it('allows attempts under the limit', () => {
    expect(canStartNewAttempt({ attemptCount: 0, maxAttempts: 3 })).toBe(true);
    expect(canStartNewAttempt({ attemptCount: 2, maxAttempts: 3 })).toBe(true);
  });

  it('blocks when the limit is reached', () => {
    expect(canStartNewAttempt({ attemptCount: 3, maxAttempts: 3 })).toBe(false);
  });
});

describe('nextAttemptNumber', () => {
  it('increments from the prior count', () => {
    expect(nextAttemptNumber(0)).toBe(1);
    expect(nextAttemptNumber(2)).toBe(3);
  });
});
