/**
 * Client-safe analytics surface.
 * Server capture helpers: `@/lib/analytics/capture`
 * PostHog node client: `@/lib/analytics/server`
 * Feature flags hook: `@/lib/analytics/featureFlags`
 */

export {
  DEFAULT_POSTHOG_HOST,
  FEATURE_FLAG_KEYS,
  getPostHogHost,
  getPostHogKey,
  getPostHogProjectUrl,
  isAnalyticsDebug,
  isAnalyticsEnabled,
  isPostHogProxyEnabled,
  type FeatureFlagKey,
} from './config';

export {
  AnalyticsEvent,
  captureClientEvent,
  captureHintUsedClient,
  durationSeconds,
  identifyAnalyticsUser,
  resetAnalytics,
  sanitizeAnalyticsProps,
  scenarioPropsFromTicket,
  type HintUsedProps,
  type GradingStuckProps,
  type LessonEventProps,
  type ScenarioContextProps,
  type ScenarioGradedProps,
  type TrackCompletedProps,
} from './events';

export { hasBrowserTrackingOptOut } from './optOut';
