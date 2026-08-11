import { afterEach, describe, expect, it } from 'vitest';

import { normalizeAppOrigin, resolveAppOrigin } from '@/lib/auth/appUrl';

describe('normalizeAppOrigin', () => {
  it('accepts absolute https origins', () => {
    expect(normalizeAppOrigin('https://cyberskill-builder.vercel.app/')).toBe(
      'https://cyberskill-builder.vercel.app'
    );
  });

  it('adds https when protocol is missing', () => {
    expect(normalizeAppOrigin('cyberskill-builder.vercel.app')).toBe(
      'https://cyberskill-builder.vercel.app'
    );
  });

  it('rejects invalid values', () => {
    expect(normalizeAppOrigin(':::')).toBeNull();
    expect(normalizeAppOrigin('')).toBeNull();
  });
});

describe('resolveAppOrigin', () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
  });

  it('prefers the request origin over a localhost APP_URL on Vercel', () => {
    process.env.VERCEL = '1';
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';

    const origin = resolveAppOrigin(
      new Request('https://cyberskill-builder.vercel.app/api/lessons/x/grade')
    );

    expect(origin).toBe('https://cyberskill-builder.vercel.app');
  });

  it('falls back to VERCEL_URL when APP_URL is localhost on Vercel', () => {
    process.env.VERCEL = '1';
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
    process.env.VERCEL_URL = 'cyberskill-builder-ubip.vercel.app';

    expect(resolveAppOrigin()).toBe(
      'https://cyberskill-builder-ubip.vercel.app'
    );
  });
});
