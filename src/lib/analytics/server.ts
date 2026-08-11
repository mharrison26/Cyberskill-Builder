import { PostHog } from 'posthog-node';

import {
  getPostHogHost,
  getPostHogKey,
  isAnalyticsEnabled,
} from './config';

let client: PostHog | null = null;

export function getPostHogServerClient(): PostHog | null {
  if (!isAnalyticsEnabled()) return null;
  const key = getPostHogKey();
  if (!key) return null;

  if (!client) {
    client = new PostHog(key, {
      host: getPostHogHost(),
      flushAt: 1,
      flushInterval: 0,
    });
  }
  return client;
}

export type ServerCaptureArgs = {
  distinctId: string;
  event: string;
  properties?: Record<string, unknown>;
  /** Person properties to $set (never email / PII content). */
  set?: Record<string, unknown>;
  /** Person properties to $set_once. */
  setOnce?: Record<string, unknown>;
};

/**
 * Capture a server-side event. No-ops when analytics is disabled.
 * Always call with a stable user id as distinctId — never email.
 */
export async function captureServerEvent(
  args: ServerCaptureArgs
): Promise<void> {
  const ph = getPostHogServerClient();
  if (!ph) return;

  try {
    ph.capture({
      distinctId: args.distinctId,
      event: args.event,
      properties: {
        ...args.properties,
        ...(args.set ? { $set: args.set } : {}),
        ...(args.setOnce ? { $set_once: args.setOnce } : {}),
      },
    });
    await ph.flush();
  } catch (error) {
    console.error('[analytics] server capture failed:', error);
  }
}

export async function identifyServerUser(args: {
  distinctId: string;
  properties?: Record<string, unknown>;
}): Promise<void> {
  const ph = getPostHogServerClient();
  if (!ph) return;

  try {
    ph.identify({
      distinctId: args.distinctId,
      properties: args.properties,
    });
    await ph.flush();
  } catch (error) {
    console.error('[analytics] server identify failed:', error);
  }
}

export async function shutdownPostHogServer(): Promise<void> {
  if (!client) return;
  try {
    await client.shutdown();
  } catch {
    // ignore
  } finally {
    client = null;
  }
}
