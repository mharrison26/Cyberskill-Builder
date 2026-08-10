import { describe, expect, it } from 'vitest';

import {
  isTicketSubmitUrl,
  optimisticProgressOnSubmitStart,
  progressFromSubmitPayload,
} from '@/lib/tickets/syncWorkbenchProgress';

const base = {
  status: 'in_progress' as const,
  startedAt: '2026-01-01T00:00:00.000Z',
  resolvedAt: null,
  slaDueAt: '2026-01-01T00:30:00.000Z',
  slaMet: null,
};

describe('optimisticProgressOnSubmitStart', () => {
  it('promotes new → in_progress', () => {
    const next = optimisticProgressOnSubmitStart(
      {
        ...base,
        status: 'new',
        startedAt: null,
        slaDueAt: null,
      },
      '2026-01-01T00:05:00.000Z'
    );
    expect(next.status).toBe('in_progress');
    expect(next.startedAt).toBe('2026-01-01T00:05:00.000Z');
  });

  it('leaves in_progress unchanged', () => {
    expect(optimisticProgressOnSubmitStart(base)).toEqual(base);
  });
});

describe('progressFromSubmitPayload', () => {
  it('maps resolved progressStatus and freezes SLA fields', () => {
    const next = progressFromSubmitPayload(
      {
        progressStatus: 'resolved',
        slaStartedAt: '2026-01-01T00:00:00.000Z',
        slaResolvedAt: '2026-01-01T00:12:00.000Z',
        slaDueAt: '2026-01-01T00:30:00.000Z',
        slaMet: true,
      },
      base
    );
    expect(next.status).toBe('resolved');
    expect(next.resolvedAt).toBe('2026-01-01T00:12:00.000Z');
    expect(next.slaMet).toBe(true);
    expect(next.slaDueAt).toBe('2026-01-01T00:30:00.000Z');
  });

  it('maps needs_revision score status to in_progress', () => {
    const next = progressFromSubmitPayload({ status: 'needs_revision' }, base);
    expect(next.status).toBe('in_progress');
    expect(next.resolvedAt).toBeNull();
  });
});

describe('isTicketSubmitUrl', () => {
  it('matches absolute and relative submit paths', () => {
    const id = 'abc-123';
    expect(isTicketSubmitUrl(`/api/tickets/${id}/submit`, id)).toBe(true);
    expect(
      isTicketSubmitUrl(`https://example.com/api/tickets/${id}/submit`, id)
    ).toBe(true);
    expect(isTicketSubmitUrl(`/api/tickets/${id}/package`, id)).toBe(false);
  });
});
