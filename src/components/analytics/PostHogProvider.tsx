'use client';

import { useEffect } from 'react';
import posthog from 'posthog-js';
import { PostHogProvider as PHProvider } from '@posthog/react';

import {
  getPostHogHost,
  getPostHogKey,
  isAnalyticsDebug,
  isAnalyticsEnabled,
  usePostHogProxy,
} from '@/lib/analytics/config';
import { hasBrowserTrackingOptOut } from '@/lib/analytics/optOut';

type PostHogProviderProps = {
  children: React.ReactNode;
};

export function PostHogProvider({ children }: PostHogProviderProps) {
  useEffect(() => {
    if (!isAnalyticsEnabled()) return;
    if (hasBrowserTrackingOptOut()) return;

    const key = getPostHogKey();
    if (!key || posthog.__loaded) return;

    const apiHost = usePostHogProxy() ? '/ingest' : getPostHogHost();

    posthog.init(key, {
      api_host: apiHost,
      ui_host: getPostHogHost().includes('eu.')
        ? 'https://eu.posthog.com'
        : 'https://us.posthog.com',
      person_profiles: 'identified_only',
      capture_pageview: true,
      capture_pageleave: true,
      persistence: 'localStorage+cookie',
      // Session replay — mask secrets / form fields by default
      disable_session_recording: false,
      session_recording: {
        maskAllInputs: true,
        maskTextSelector: '[data-ph-mask], [data-sensitive]',
        recordCrossOriginIframes: false,
      },
      loaded: (client) => {
        if (isAnalyticsDebug()) {
          client.debug();
        }
      },
    });
  }, []);

  return <PHProvider client={posthog}>{children}</PHProvider>;
}
