import { describe, expect, it } from 'vitest';

import {
  AnalyticsEvent,
  durationSeconds,
  sanitizeAnalyticsProps,
  scenarioPropsFromTicket,
} from './events';

describe('AnalyticsEvent', () => {
  it('uses stable funnel event names', () => {
    expect({
      signup: AnalyticsEvent.FUNNEL_SIGNUP,
      firstLesson: AnalyticsEvent.FUNNEL_FIRST_LESSON_OPENED,
      firstScenarioSubmitted: AnalyticsEvent.FUNNEL_FIRST_SCENARIO_SUBMITTED,
      firstScenarioGraded: AnalyticsEvent.FUNNEL_FIRST_SCENARIO_GRADED,
      secondSession: AnalyticsEvent.FUNNEL_SECOND_SESSION,
      trackCompleted: AnalyticsEvent.TRACK_COMPLETED,
      gradingStuck: AnalyticsEvent.GRADING_STUCK,
    }).toEqual({
      signup: 'signup',
      firstLesson: 'first_lesson_opened',
      firstScenarioSubmitted: 'first_scenario_submitted',
      firstScenarioGraded: 'first_scenario_graded',
      secondSession: 'second_session',
      trackCompleted: 'track_completed',
      gradingStuck: 'grading_stuck',
    });
  });
});

describe('sanitizeAnalyticsProps', () => {
  it('strips PII keys', () => {
    expect(
      sanitizeAnalyticsProps({
        tier: 1,
        email: 'a@b.com',
        scenario_brief: 'secret',
        type: 'poam',
      })
    ).toEqual({ tier: 1, type: 'poam' });
  });
});

describe('scenarioPropsFromTicket', () => {
  it('derives control_family without brief text', () => {
    expect(
      scenarioPropsFromTicket({
        id: 't1',
        ticket_type: 'poam',
        tier: 2,
        track_id: 'tr1',
        initial_state: { control_id: 'AC-2' },
      })
    ).toEqual({
      type: 'poam',
      tier: 2,
      control_family: 'AC',
      ticket_id: 't1',
      track_id: 'tr1',
      track_slug: undefined,
    });
  });
});

describe('durationSeconds', () => {
  it('returns rounded seconds', () => {
    expect(
      durationSeconds('2026-01-01T00:00:00.000Z', '2026-01-01T00:01:30.000Z')
    ).toBe(90);
  });
});
