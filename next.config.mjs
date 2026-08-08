import { withSentryConfig } from '@sentry/nextjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required for src/instrumentation.ts on Next.js 14
  experimental: {
    instrumentationHook: true,
  },
  /**
   * Cross-origin isolation for WebContainers (SharedArrayBuffer).
   * COEP `credentialless` is less brittle than `require-corp` for third-party
   * assets (Supabase, Stripe, fonts) while still enabling isolation in modern browsers.
   * Must match WebContainer.boot({ coep: 'credentialless' }) in CodeSandbox.
   */
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin',
          },
          {
            key: 'Cross-Origin-Embedder-Policy',
            value: 'credentialless',
          },
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  // Optional source-map upload (skipped when SENTRY_AUTH_TOKEN is unset).
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  // Keep builds green without Sentry credentials.
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
  webpack: {
    // Avoid tracing noise / cost on the uptime probe.
    excludeServerRoutes: ['/api/health'],
  },
});
