'use client';

import {
  useFeatureFlagEnabled,
  useFeatureFlagVariantKey,
} from '@posthog/react';

import {
  FEATURE_FLAG_KEYS,
  type FeatureFlagKey,
  isAnalyticsEnabled,
} from './config';

export { FEATURE_FLAG_KEYS, type FeatureFlagKey };

/**
 * Boolean feature flag helper wrapping PostHog.
 * Returns `false` when analytics is disabled / flag unset.
 */
export function useFeatureFlag(key: FeatureFlagKey | string): boolean {
  const enabled = useFeatureFlagEnabled(key);
  if (!isAnalyticsEnabled()) return false;
  return enabled === true;
}

/**
 * Multivariate / experiment variant (`'control'`, `'test'`, etc.).
 * Returns `null` when unavailable.
 */
export function useFeatureFlagVariant(
  key: FeatureFlagKey | string
): string | boolean | null {
  const variant = useFeatureFlagVariantKey(key);
  if (!isAnalyticsEnabled()) return null;
  return variant ?? null;
}
