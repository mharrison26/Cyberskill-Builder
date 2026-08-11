/**
 * Server-side typed capture helpers (posthog-node).
 * Import from here or `@/lib/analytics` in Server Components / actions / routes only.
 */

import {
  AnalyticsEvent,
  sanitizeAnalyticsProps,
  type HintUsedProps,
  type GradingStuckProps,
  type LessonEventProps,
  type ScenarioContextProps,
  type ScenarioGradedProps,
  type TrackCompletedProps,
} from './events';
import { captureServerEvent } from './server';

export async function captureUserSignedUp(
  distinctId: string,
  props?: { has_cohort_code?: boolean }
): Promise<void> {
  await captureServerEvent({
    distinctId,
    event: AnalyticsEvent.USER_SIGNED_UP,
    properties: sanitizeAnalyticsProps(props),
    setOnce: { signed_up_at: new Date().toISOString() },
  });
  await captureServerEvent({
    distinctId,
    event: AnalyticsEvent.FUNNEL_SIGNUP,
  });
}

export async function captureUserSignedIn(
  distinctId: string,
  props?: { via?: 'password' | 'sso' | 'mfa' }
): Promise<void> {
  await captureServerEvent({
    distinctId,
    event: AnalyticsEvent.USER_SIGNED_IN,
    properties: sanitizeAnalyticsProps(props),
  });
}

export async function captureLessonOpened(
  distinctId: string,
  props: LessonEventProps & { is_first?: boolean }
): Promise<void> {
  await captureServerEvent({
    distinctId,
    event: AnalyticsEvent.LESSON_OPENED,
    properties: sanitizeAnalyticsProps(props),
  });
  if (props.is_first) {
    await captureServerEvent({
      distinctId,
      event: AnalyticsEvent.FUNNEL_FIRST_LESSON_OPENED,
      properties: sanitizeAnalyticsProps({
        lesson_id: props.lesson_id,
        track_slug: props.track_slug,
      }),
      setOnce: { first_lesson_opened_at: new Date().toISOString() },
    });
  }
}

export async function captureLessonCompleted(
  distinctId: string,
  props: LessonEventProps & { score?: number | null }
): Promise<void> {
  await captureServerEvent({
    distinctId,
    event: AnalyticsEvent.LESSON_COMPLETED,
    properties: sanitizeAnalyticsProps(props),
  });
}

export async function captureScenarioStarted(
  distinctId: string,
  props: ScenarioContextProps
): Promise<void> {
  await captureServerEvent({
    distinctId,
    event: AnalyticsEvent.SCENARIO_STARTED,
    properties: sanitizeAnalyticsProps(props),
  });
}

export async function captureScenarioSubmitted(
  distinctId: string,
  props: ScenarioContextProps & { is_first?: boolean }
): Promise<void> {
  await captureServerEvent({
    distinctId,
    event: AnalyticsEvent.SCENARIO_SUBMITTED,
    properties: sanitizeAnalyticsProps(props),
  });
  if (props.is_first) {
    await captureServerEvent({
      distinctId,
      event: AnalyticsEvent.FUNNEL_FIRST_SCENARIO_SUBMITTED,
      properties: sanitizeAnalyticsProps({
        type: props.type,
        tier: props.tier,
        control_family: props.control_family,
      }),
      setOnce: { first_scenario_submitted_at: new Date().toISOString() },
    });
  }
}

export async function captureScenarioGraded(
  distinctId: string,
  props: ScenarioGradedProps & { is_first_graded?: boolean }
): Promise<void> {
  await captureServerEvent({
    distinctId,
    event: AnalyticsEvent.SCENARIO_GRADED,
    properties: sanitizeAnalyticsProps(props),
  });
  if (props.is_first_graded) {
    await captureServerEvent({
      distinctId,
      event: AnalyticsEvent.FUNNEL_FIRST_SCENARIO_GRADED,
      properties: sanitizeAnalyticsProps({
        type: props.type,
        tier: props.tier,
        control_family: props.control_family,
        score: props.score,
      }),
      setOnce: { first_scenario_resolved_at: new Date().toISOString() },
    });
  }
}

export async function captureGradingStuck(
  distinctId: string,
  props: GradingStuckProps
): Promise<void> {
  await captureServerEvent({
    distinctId,
    event: AnalyticsEvent.GRADING_STUCK,
    properties: sanitizeAnalyticsProps(props),
  });
}

/**
 * Hint instrumentation helper for the tutor agent.
 * Call from hint API / UI once the hint endpoint exists.
 */
export async function captureHintUsed(
  distinctId: string,
  props: HintUsedProps
): Promise<void> {
  await captureServerEvent({
    distinctId,
    event: AnalyticsEvent.HINT_USED,
    properties: sanitizeAnalyticsProps(props),
  });
}

export async function captureTrackCompleted(
  distinctId: string,
  props: TrackCompletedProps
): Promise<void> {
  await captureServerEvent({
    distinctId,
    event: AnalyticsEvent.TRACK_COMPLETED,
    properties: sanitizeAnalyticsProps(props),
    setOnce: {
      first_track_completed_at: new Date().toISOString(),
    },
  });
}
