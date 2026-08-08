import { NextResponse } from 'next/server';

/**
 * Lightweight liveness probe for uptime checks.
 * Intentionally avoids DB / auth / external calls.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ ok: true, status: 'healthy' }, { status: 200 });
}
