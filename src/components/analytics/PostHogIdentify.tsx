'use client';

import { useEffect, useRef } from 'react';

import { isAnalyticsEnabled } from '@/lib/analytics/config';
import {
  AnalyticsEvent,
  captureClientEvent,
  identifyAnalyticsUser,
} from '@/lib/analytics/events';
import { hasBrowserTrackingOptOut } from '@/lib/analytics/optOut';

type PostHogIdentifyProps = {
  userId: string;
  isAdmin?: boolean;
};

/**
 * Identifies the authenticated user (user id as distinct_id).
 * Also emits `funnel_second_session` once when the learner returns
 * on a later browser session after a prior visit was recorded.
 */
export function PostHogIdentify({
  userId,
  isAdmin = false,
}: PostHogIdentifyProps) {
  const identifiedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isAnalyticsEnabled() || hasBrowserTrackingOptOut()) return;
    if (!userId) return;
    if (identifiedRef.current === userId) return;

    identifiedRef.current = userId;

    void identifyAnalyticsUser({
      distinctId: userId,
      isAdmin,
      role: isAdmin ? 'admin' : 'learner',
    });

    try {
      const everKey = `csb_analytics_ever:${userId}`;
      const sessionKey = `csb_analytics_sess:${userId}`;
      const firedKey = `csb_analytics_second_fired:${userId}`;

      if (window.sessionStorage.getItem(sessionKey)) {
        return;
      }
      window.sessionStorage.setItem(sessionKey, '1');

      if (window.localStorage.getItem(everKey)) {
        if (!window.localStorage.getItem(firedKey)) {
          void captureClientEvent(AnalyticsEvent.FUNNEL_SECOND_SESSION);
          window.localStorage.setItem(firedKey, '1');
        }
      } else {
        window.localStorage.setItem(everKey, '1');
      }
    } catch {
      // private mode / blocked storage
    }
  }, [userId, isAdmin]);

  return null;
}
