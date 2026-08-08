import * as Sentry from '@sentry/nextjs';

/**
 * Tagged Sentry helpers for PI feature pipelines.
 * Safe no-op when SENTRY_DSN / NEXT_PUBLIC_SENTRY_DSN is unset.
 *
 * Do not attach raw student file contents or submission bodies.
 */

export type SentryFeature = 'scoring' | 'sandbox';
export type SentryPi = 'PI-03' | 'PI-05' | 'PI-06';

export type FeatureErrorContext = {
  feature: SentryFeature;
  pi: SentryPi;
  /** Short operation name, e.g. score_submission, fly_launch */
  operation?: string;
  ticketId?: string;
  ticketType?: string;
  level?: Sentry.SeverityLevel;
  /** Non-PII extras only (status codes, rule counts, machine ids, etc.) */
  extras?: Record<string, unknown>;
};

function applyFeatureScope(
  scope: Sentry.Scope,
  context: FeatureErrorContext
): void {
  scope.setTag('feature', context.feature);
  scope.setTag('pi', context.pi);
  if (context.operation) {
    scope.setTag('operation', context.operation);
  }
  if (context.ticketId) {
    scope.setTag('ticket_id', context.ticketId);
  }
  if (context.ticketType) {
    scope.setTag('ticket_type', context.ticketType);
  }
  if (context.level) {
    scope.setLevel(context.level);
  }
  if (context.extras) {
    for (const [key, value] of Object.entries(context.extras)) {
      scope.setExtra(key, value);
    }
  }
}

/** Capture an exception with PI / feature tags for Sentry filtering. */
export function captureFeatureException(
  error: unknown,
  context: FeatureErrorContext
): void {
  Sentry.withScope((scope) => {
    applyFeatureScope(scope, context);
    Sentry.captureException(error);
  });
}

/** Capture a message (e.g. soft LLM fallback) with PI / feature tags. */
export function captureFeatureMessage(
  message: string,
  context: FeatureErrorContext
): void {
  Sentry.withScope((scope) => {
    applyFeatureScope(scope, {
      ...context,
      level: context.level ?? 'warning',
    });
    Sentry.captureMessage(message, context.level ?? 'warning');
  });
}
