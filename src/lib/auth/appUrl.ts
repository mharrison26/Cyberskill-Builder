import { headers } from 'next/headers';

function stripTrailingSlash(url: string): string {
  return url.replace(/\/$/, '');
}

function isLocalhostOrigin(origin: string): boolean {
  try {
    const parsed = new URL(origin);
    return (
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === '::1'
    );
  } catch {
    return false;
  }
}

/** Normalize a configured/request origin into an absolute http(s) origin. */
export function normalizeAppOrigin(
  raw: string | null | undefined
): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed.replace(/^\/+/, '')}`;

  try {
    const parsed = new URL(withProtocol);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return stripTrailingSlash(parsed.origin);
  } catch {
    return null;
  }
}

/**
 * Resolve the public app origin for server-to-server kicks.
 * Prefers the incoming request host on Vercel so a mistaken
 * NEXT_PUBLIC_APP_URL=http://localhost:3000 cannot break prod workers.
 */
export function resolveAppOrigin(request?: Request): string | null {
  if (request) {
    try {
      const fromRequest = normalizeAppOrigin(new URL(request.url).origin);
      if (fromRequest && !isLocalhostOrigin(fromRequest)) {
        return fromRequest;
      }
      // Allow localhost when the request itself is local (dev).
      if (fromRequest) return fromRequest;
    } catch {
      // fall through
    }
  }

  const configured = normalizeAppOrigin(process.env.NEXT_PUBLIC_APP_URL);
  const onVercel = Boolean(process.env.VERCEL);
  if (configured && !(onVercel && isLocalhostOrigin(configured))) {
    return configured;
  }

  const fromVercel = normalizeAppOrigin(
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null
  );
  if (fromVercel) return fromVercel;

  return configured;
}

/** Canonical app origin for auth email links and redirects. */
export async function getAppOrigin(): Promise<string> {
  const resolved = resolveAppOrigin();
  if (resolved) return resolved;

  const headerStore = await headers();
  const host = headerStore.get('x-forwarded-host') ?? headerStore.get('host');
  const proto = headerStore.get('x-forwarded-proto') ?? 'http';
  if (host) {
    const fromHeaders = normalizeAppOrigin(`${proto}://${host}`);
    if (fromHeaders) return fromHeaders;
  }

  return 'http://localhost:3000';
}
