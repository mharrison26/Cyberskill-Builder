import { describe, expect, it } from 'vitest';

import type { ScorableTicket } from '@/lib/scoring';
import { getTicketScorer, listRegisteredTicketTypes } from '@/lib/scoring';
import {
  evaluateP1StatusUpdates,
  extractP1StatusUpdatesSubmission,
  formatSimClock,
  matchCadenceSlots,
  p1StatusUpdatesTicketScorer,
  resolveRequiredUpdateTimes,
} from '@/lib/scoring/p1StatusUpdates';

function ticket(overrides: Partial<ScorableTicket> = {}): ScorableTicket {
  return {
    id: 't-p1-status',
    tenant_id: 'ten1',
    track_id: 'tr1',
    tier: 1,
    ticket_type: 'p1_status_updates',
    difficulty: 'critical',
    sla_minutes: 60,
    scenario_brief: 'Post P1 stakeholder updates on cadence.',
    initial_state: {
      ticketCode: 'HD-P1-01',
      outage: {
        title: 'SSO authentication outage',
        service: 'Corporate SSO',
        summary: 'Users cannot sign in to business apps.',
        impactFacts:
          'All SSO-dependent apps unavailable for ~4,200 employees worldwide.',
      },
      channel: { name: '#incident-comms' },
      clock: {
        startSimMinutes: 0,
        maxSimMinutes: 90,
        advanceStepsMinutes: [5, 15, 30],
      },
    },
    expected_state: {
      requiredUpdateTimes: [0, 30, 60],
      cadenceToleranceMinutes: 5,
      minFieldLength: 20,
      requireNextUpdatePromise: true,
    },
    dcwf_code: '722',
    sort_order: 0,
    ...overrides,
  };
}

const solidUpdates = [
  {
    postedAtSimMinutes: 0,
    impact:
      'Corporate SSO is down; ~4,200 employees cannot reach business apps.',
    eta: 'Investigating IdP region failover; restore target within 45 minutes.',
    nextUpdateAtSimMinutes: 30,
  },
  {
    postedAtSimMinutes: 30,
    impact:
      'SSO still unavailable globally; password vault and VPN also blocked.',
    eta: 'Failover in progress; revised restore ETA approximately 40 minutes.',
    nextUpdateAtSimMinutes: 60,
  },
  {
    postedAtSimMinutes: 60,
    impact:
      'Partial SSO restore for Americas; EMEA/APAC still failing MFA checks.',
    eta: 'Full restore expected within 20 minutes after token cache flush.',
    nextUpdateAtSimMinutes: 90,
  },
];

describe('formatSimClock', () => {
  it('formats T+HH:MM', () => {
    expect(formatSimClock(0)).toBe('T+00:00');
    expect(formatSimClock(30)).toBe('T+00:30');
    expect(formatSimClock(90)).toBe('T+01:30');
  });
});

describe('resolveRequiredUpdateTimes', () => {
  it('uses explicit requiredUpdateTimes', () => {
    expect(
      resolveRequiredUpdateTimes({ requiredUpdateTimes: [60, 0, 30] })
    ).toEqual([0, 30, 60]);
  });

  it('derives times from cadence and window', () => {
    expect(
      resolveRequiredUpdateTimes(
        { requiredCadenceMinutes: 30, incidentWindowMinutes: 90 },
        {}
      )
    ).toEqual([0, 30, 60]);
  });

  it('reads window from initial_state.clock when needed', () => {
    expect(
      resolveRequiredUpdateTimes(
        { requiredCadenceMinutes: 15 },
        { clock: { maxSimMinutes: 45 } }
      )
    ).toEqual([0, 15, 30]);
  });
});

describe('extractP1StatusUpdatesSubmission', () => {
  it('normalizes updates', () => {
    expect(
      extractP1StatusUpdatesSubmission({
        type: 'p1_status_updates',
        updates: solidUpdates,
      })
    ).toMatchObject({
      type: 'p1_status_updates',
      updates: solidUpdates,
    });
  });

  it('accepts snake_case next update field', () => {
    const parsed = extractP1StatusUpdatesSubmission({
      updates: [
        {
          posted_at_sim_minutes: 0,
          impact: 'x'.repeat(25),
          eta: 'y'.repeat(25),
          next_update_at_sim_minutes: 30,
        },
      ],
    });
    expect(parsed?.updates[0]).toMatchObject({
      postedAtSimMinutes: 0,
      nextUpdateAtSimMinutes: 30,
    });
  });

  it('returns null when updates are missing', () => {
    expect(extractP1StatusUpdatesSubmission({})).toBeNull();
    expect(extractP1StatusUpdatesSubmission({ updates: [] })).toBeNull();
  });
});

describe('matchCadenceSlots', () => {
  it('matches within tolerance and consumes updates', () => {
    const matches = matchCadenceSlots(
      [0, 30, 60],
      [
        { ...solidUpdates[0], postedAtSimMinutes: 2 },
        { ...solidUpdates[1], postedAtSimMinutes: 33 },
        { ...solidUpdates[2], postedAtSimMinutes: 58 },
      ],
      5
    );
    expect(matches.every((m) => m.matched)).toBe(true);
    expect(matches[0].deltaMinutes).toBe(2);
  });

  it('marks misses outside tolerance', () => {
    const matches = matchCadenceSlots(
      [0, 30],
      [{ ...solidUpdates[0], postedAtSimMinutes: 20 }],
      5
    );
    expect(matches[0].matched).toBe(false);
    expect(matches[1].matched).toBe(false);
  });
});

describe('evaluateP1StatusUpdates', () => {
  it('rejects empty submission', () => {
    const result = evaluateP1StatusUpdates({}, ticket());
    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('missing_updates');
  });

  it('rejects cadence misses', () => {
    const result = evaluateP1StatusUpdates(
      { updates: [solidUpdates[0], solidUpdates[2]] },
      ticket()
    );
    expect(result.ok).toBe(false);
    expect(result.structured.cadenceOk).toBe(false);
    expect(result.structured.reason).toBe('cadence_miss');
    expect(result.feedback).toContain('T+00:30');
  });

  it('rejects incomplete content when cadence is met', () => {
    const result = evaluateP1StatusUpdates(
      {
        updates: [
          solidUpdates[0],
          { ...solidUpdates[1], impact: 'too short', eta: 'also short' },
          solidUpdates[2],
        ],
      },
      ticket()
    );
    expect(result.ok).toBe(false);
    expect(result.structured.cadenceOk).toBe(true);
    expect(result.structured.contentOk).toBe(false);
    expect(result.structured.reason).toBe('content_incomplete');
    expect(result.feedback).toContain('impact');
  });

  it('rejects next-update promise that skips the next slot', () => {
    const result = evaluateP1StatusUpdates(
      {
        updates: [
          { ...solidUpdates[0], nextUpdateAtSimMinutes: 90 },
          solidUpdates[1],
          solidUpdates[2],
        ],
      },
      ticket()
    );
    expect(result.ok).toBe(false);
    expect(result.structured.contentOk).toBe(false);
    expect(result.feedback).toContain('next_update_promise');
  });

  it('passes complete cadence + content', () => {
    const result = evaluateP1StatusUpdates(
      { type: 'p1_status_updates', updates: solidUpdates },
      ticket()
    );
    expect(result.ok).toBe(true);
    expect(result.structured).toMatchObject({
      style: 'p1_status_updates',
      cadenceOk: true,
      contentOk: true,
      cadenceMatchedCount: 3,
      cadenceRequiredCount: 3,
    });
  });

  it('scorer returns resolved for a solid submission', async () => {
    const scored = await p1StatusUpdatesTicketScorer.score(
      { updates: solidUpdates },
      ticket()
    );
    expect(scored.status).toBe('resolved');
    expect(scored.structuredResult).toMatchObject({
      style: 'p1_status_updates',
      cadenceOk: true,
      contentOk: true,
    });
  });
});

describe('registry', () => {
  it('registers p1_status_updates aliases', () => {
    expect(listRegisteredTicketTypes()).toEqual(
      expect.arrayContaining([
        'p1_status_updates',
        'incident_status_cadence',
        'stakeholder_updates',
        'outage_comms',
      ])
    );
    expect(getTicketScorer('p1_status_updates')).toBe(
      p1StatusUpdatesTicketScorer
    );
    expect(getTicketScorer('outage_comms')).toBe(p1StatusUpdatesTicketScorer);
  });
});
