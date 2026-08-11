import { withSentryConfig } from '@sentry/nextjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required for src/instrumentation.ts on Next.js 14
  experimental: {
    instrumentationHook: true,
    // Ticket workbench + catalog load data/oscal/control-catalog.json via fs.
    // Without tracing includes, Vercel omits the file and RSC crashes.
    outputFileTracingIncludes: {
      '/tracks/*/tickets/*': ['./data/oscal/control-catalog.json'],
      '/catalog': ['./data/oscal/control-catalog.json'],
      '/catalog/*': ['./data/oscal/control-catalog.json'],
      '/tracks/grc/catalog': ['./data/oscal/control-catalog.json'],
      '/api/search': ['./data/oscal/control-catalog.json'],
    },
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
  /**
   * Optional PostHog reverse proxy. Enable with NEXT_PUBLIC_POSTHOG_PROXY=1
   * and set posthog api_host to `/ingest` (see PostHogProvider).
   */
  async rewrites() {
    return [
      {
        source: '/ingest/static/:path*',
        destination: 'https://us-assets.i.posthog.com/static/:path*',
      },
      {
        source: '/ingest/:path*',
        destination: 'https://us.i.posthog.com/:path*',
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  // Same-origin endpoint avoids client-side ad-blocker interference.
  tunnelRoute: '/monitoring',
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
