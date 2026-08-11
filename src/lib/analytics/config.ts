/**
 * PostHog env + enablement helpers.
 * Safe when keys are missing — callers should no-op.
 */

export const DEFAULT_POSTHOG_HOST = 'https://us.i.posthog.com';

/** Suggested feature flags for audit A/B tests. */
export const FEATURE_FLAG_KEYS = {
  GRC_CONSOLE_ROW_NAV: 'grc-console-row-nav',
  COMPLETION_PANEL_V2: 'completion-panel-v2',
  SCENARIO_HINT_COACH: 'scenario-hint-coach',
} as const;

export type FeatureFlagKey =
  (typeof FEATURE_FLAG_KEYS)[keyof typeof FEATURE_FLAG_KEYS];

export function getPostHogKey(): string | undefined {
  const key =
    process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim() ||
    process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN?.trim();
  return key || undefined;
}

export function getPostHogHost(): string {
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim();
  return host || DEFAULT_POSTHOG_HOST;
}

/** When true, browser events go through same-origin `/ingest` rewrite. */
export function isPostHogProxyEnabled(): boolean {
  return process.env.NEXT_PUBLIC_POSTHOG_PROXY === '1';
}

export function isAnalyticsDebug(): boolean {
  return process.env.NEXT_PUBLIC_ANALYTICS_DEBUG === '1';
}

/**
 * Client/server capture gate.
 * - Missing key → disabled
 * - Development → only when NEXT_PUBLIC_ANALYTICS_DEBUG=1 (avoids polluting prod)
 * - Production → enabled when key present
 */
export function isAnalyticsEnabled(): boolean {
  if (!getPostHogKey()) return false;
  if (process.env.NODE_ENV === 'development' && !isAnalyticsDebug()) {
    return false;
  }
  return true;
}

export function getPostHogProjectUrl(): string | null {
  const projectId = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_ID?.trim();
  if (!projectId) return null;
  const host = getPostHogHost();
  const appHost = host.includes('eu.')
    ? 'https://eu.posthog.com'
    : 'https://us.posthog.com';
  return `${appHost}/project/${projectId}`;
}
