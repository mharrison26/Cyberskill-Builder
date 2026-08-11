/**
 * Analytics privacy / opt-out.
 *
 * There is no dedicated in-app analytics opt-out yet
 * (`user_notification_preferences.email_marketing` is email-only and is NOT
 * treated as an analytics switch). Respect browser DNT / GPC when present.
 *
 * To add an explicit opt-out later: store a boolean on the user profile and
 * check it here + pass `opted_out` into PostHogIdentify so capture is skipped.
 */

export function hasBrowserTrackingOptOut(): boolean {
  if (typeof navigator === 'undefined') return false;

  const nav = navigator as Navigator & {
    globalPrivacyControl?: boolean;
    msDoNotTrack?: string;
  };

  if (nav.globalPrivacyControl === true) return true;

  const dnt = nav.doNotTrack ?? nav.msDoNotTrack;
  return dnt === '1' || dnt === 'yes';
}
