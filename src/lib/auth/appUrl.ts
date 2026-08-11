import { headers } from 'next/headers';

/** Canonical app origin for auth email links and redirects. */
export async function getAppOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '');
  if (configured) return configured;

  const headerStore = await headers();
  const host = headerStore.get('x-forwarded-host') ?? headerStore.get('host');
  const proto = headerStore.get('x-forwarded-proto') ?? 'http';
  if (host) return `${proto}://${host}`;

  return 'http://localhost:3000';
}
