/**
 * Shared event names/types + client-safe helpers.
 * Server captures live in `./capture` (imports posthog-node).
 *
 * Privacy: distinct_id = user id only. Do not attach emails, scenario brief
 * text, submission bodies, or other PII in event properties.
 */

import { controlFamilyFromId } from '@/lib/progress/controlFamily';

import { isAnalyticsEnabled } from './config';

export const AnalyticsEvent = {
  USER_SIGNED_UP: 'user_signed_up',
  USER_SIGNED_IN: 'user_signed_in',
  LESSON_OPENED: 'lesson_opened',
  LESSON_COMPLETED: 'lesson_completed',
  SCENARIO_STARTED: 'scenario_started',
  SCENARIO_SUBMITTED: 'scenario_submitted',
  SCENARIO_GRADED: 'scenario_graded',
  GRADING_STUCK: 'grading_stuck',
  HINT_USED: 'hint_used',
  TRACK_COMPLETED: 'track_completed',
  // Funnel milestones (also usable as PostHog funnel steps)
  FUNNEL_SIGNUP: 'signup',
  FUNNEL_FIRST_LESSON_OPENED: 'first_lesson_opened',
  FUNNEL_FIRST_SCENARIO_SUBMITTED: 'first_scenario_submitted',
  FUNNEL_FIRST_SCENARIO_GRADED: 'first_scenario_graded',
  FUNNEL_SECOND_SESSION: 'second_session',
  // Onboarding / activation
  ONBOARDING_STARTED: 'onboarding_started',
  ONBOARDING_COMPLETED: 'onboarding_completed',
  CHECKLIST_ITEM_COMPLETED: 'checklist_item_completed',
  GETTING_STARTED_DISMISSED: 'getting_started_dismissed',
  SCENARIO_WALKTHROUGH_COMPLETED: 'scenario_walkthrough_completed',
  SCENARIO_WALKTHROUGH_SKIPPED: 'scenario_walkthrough_skipped',
} as const;

export type AnalyticsEventName =
  (typeof AnalyticsEvent)[keyof typeof AnalyticsEvent];

export type ScenarioContextProps = {
  type: string;
  tier: number | string;
  control_family: string | null;
  ticket_id?: string;
  track_id?: string;
  track_slug?: string;
};

export type ScenarioGradedProps = ScenarioContextProps & {
  score: number | null;
  duration_seconds: number | null;
  sla_met: boolean | null;
  score_status?: string;
};

export type HintUsedProps = {
  ticket_id?: string;
  lesson_id?: string;
  hint_tier?: number;
  source?: 'tutor' | 'ui' | 'other';
};

export type LessonEventProps = {
  lesson_id: string;
  lesson_type?: string | null;
  tier?: number | string | null;
  track_id?: string | null;
  track_slug?: string | null;
  control_family?: string | null;
};

export type TrackCompletedProps = {
  track_id: string;
  track_slug?: string | null;
  verification_id?: string | null;
};

export type GradingStuckProps = {
  progress_id: string;
  lesson_id: string;
  job_status: string | null;
  attempt_count: number | null;
};

export function sanitizeAnalyticsProps(
  props?: Record<string, unknown>
): Record<string, unknown> | undefined {
  if (!props) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined) continue;
    if (
      key === 'email' ||
      key === 'scenario_brief' ||
      key === 'brief' ||
      key === 'submission' ||
      key === 'password'
    ) {
      continue;
    }
    out[key] = value;
  }
  return out;
}

/** Client-side capture (dynamic import so SSR stays clean). */
export async function captureClientEvent(
  event: AnalyticsEventName | string,
  properties?: Record<string, unknown>
): Promise<void> {
  if (!isAnalyticsEnabled()) return;
  if (typeof window === 'undefined') return;

  try {
    const posthog = (await import('posthog-js')).default;
    if (!posthog.__loaded) return;
    posthog.capture(event, sanitizeAnalyticsProps(properties));
  } catch (error) {
    console.error('[analytics] client capture failed:', error);
  }
}

export async function resetAnalytics(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const posthog = (await import('posthog-js')).default;
    if (posthog.__loaded) {
      posthog.reset();
    }
  } catch {
    // ignore
  }
}

export async function identifyAnalyticsUser(args: {
  distinctId: string;
  isAdmin?: boolean;
  role?: string;
}): Promise<void> {
  if (!isAnalyticsEnabled()) return;
  if (typeof window === 'undefined') return;

  try {
    const posthog = (await import('posthog-js')).default;
    if (!posthog.__loaded) return;
    posthog.identify(args.distinctId, {
      is_admin: args.isAdmin === true,
      role: args.role ?? (args.isAdmin ? 'admin' : 'learner'),
    });
  } catch (error) {
    console.error('[analytics] identify failed:', error);
  }
}

/** Client-side variant when the hint UI fires before a server round-trip. */
export async function captureHintUsedClient(
  props: HintUsedProps
): Promise<void> {
  await captureClientEvent(AnalyticsEvent.HINT_USED, props);
}

export function scenarioPropsFromTicket(ticket: {
  id: string;
  ticket_type: string;
  tier: number | string;
  track_id?: string | null;
  initial_state?: Record<string, unknown> | null;
  expected_state?: Record<string, unknown> | null;
  track_slug?: string | null;
}): ScenarioContextProps {
  const controlId =
    (typeof ticket.initial_state?.control_id === 'string'
      ? ticket.initial_state.control_id
      : null) ??
    (typeof ticket.expected_state?.control_id === 'string'
      ? ticket.expected_state.control_id
      : null);

  return {
    type: ticket.ticket_type,
    tier: ticket.tier,
    control_family: controlFamilyFromId(controlId),
    ticket_id: ticket.id,
    track_id: ticket.track_id ?? undefined,
    track_slug: ticket.track_slug ?? undefined,
  };
}

export function durationSeconds(
  startedAt: string | null | undefined,
  endedAt: string | null | undefined
): number | null {
  if (!startedAt || !endedAt) return null;
  const start = Date.parse(startedAt);
  const end = Date.parse(endedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return null;
  }
  return Math.round((end - start) / 1000);
}
