/**
 * Authenticated production-route synthetic.
 *
 * Loads the dashboard, one enrolled lesson, and one GRC ticket workbench.
 * Configure it from GitHub Actions (or another external scheduler) with:
 * UPTIME_SMOKE_URL, UPTIME_TEST_EMAIL, and UPTIME_TEST_PASSWORD.
 */

import * as Sentry from '@sentry/nextjs';
import { PostHog } from 'posthog-node';
import { chromium, type Page } from 'playwright';

const baseUrl = (
  process.env.UPTIME_SMOKE_URL ??
  process.env.SMOKE_BASE_URL ??
  'http://localhost:3000'
).replace(/\/$/, '');

const sentryDsn =
  process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN ?? '';
const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY ?? '';

Sentry.init({
  dsn: sentryDsn,
  enabled: Boolean(sentryDsn),
  sendDefaultPii: false,
  tracesSampleRate: 0,
});

const posthog = posthogKey
  ? new PostHog(posthogKey, {
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',
      flushAt: 1,
      flushInterval: 0,
    })
  : null;

function credentials(): { email: string; password: string } {
  const email = (
    process.env.UPTIME_TEST_EMAIL ??
    process.env.SMOKE_TEST_EMAIL ??
    process.env.A11Y_TEST_EMAIL
  )?.trim();
  const password =
    process.env.UPTIME_TEST_PASSWORD ??
    process.env.SMOKE_TEST_PASSWORD ??
    process.env.A11Y_TEST_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'UPTIME_TEST_EMAIL and UPTIME_TEST_PASSWORD are required for the authenticated uptime synthetic.'
    );
  }
  return { email, password };
}

async function reportFailure(route: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  Sentry.withScope((scope) => {
    scope.setTag('synthetic', 'uptime');
    scope.setTag('route', route);
    scope.setExtra('base_url', baseUrl);
    Sentry.captureException(error);
  });
  await Sentry.flush(2_000);

  if (posthog) {
    posthog.capture({
      distinctId: 'uptime-synthetic',
      event: 'uptime_smoke_failed',
      properties: { route, message },
    });
    await posthog.flush();
  }
}

async function assertPage(
  page: Page,
  path: string,
  label: string
): Promise<void> {
  const response = await page.goto(`${baseUrl}${path}`, {
    waitUntil: 'domcontentloaded',
    timeout: 45_000,
  });
  const status = response?.status() ?? 0;
  const body = await page.locator('body').innerText();
  const crashed =
    body.includes('Application error') ||
    body.includes('An error occurred in the Server Components render');

  if (status !== 200 || crashed) {
    throw new Error(
      `${label} failed: HTTP ${status}; server_component_error=${crashed}`
    );
  }
}

async function signIn(
  page: Page,
  email: string,
  password: string
): Promise<void> {
  await page.goto(`${baseUrl}/sign-in`, {
    waitUntil: 'networkidle',
    timeout: 45_000,
  });
  await page.locator('#sign-in-email').fill(email);
  await page.locator('#sign-in-password').fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL('**/dashboard', { timeout: 30_000 });
}

async function main(): Promise<void> {
  const { email, password } = credentials();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  let route = '/dashboard';

  try {
    await signIn(page, email, password);
    await assertPage(page, route, 'Dashboard');

    const lessonHref = await page
      .locator('a[href*="/lessons/"]')
      .first()
      .getAttribute('href');
    if (!lessonHref) {
      throw new Error('No enrolled lesson link found on dashboard.');
    }
    route = lessonHref;
    await assertPage(page, route, 'Lesson');

    const ticketsResponse = await page.request.get(
      `${baseUrl}/api/tracks/grc/tickets`
    );
    if (!ticketsResponse.ok()) {
      throw new Error(`Ticket list failed: HTTP ${ticketsResponse.status()}`);
    }
    const payload = (await ticketsResponse.json()) as {
      tickets?: Array<{ workbenchHref?: string | null }>;
    };
    const ticketHref = payload.tickets?.find(
      (ticket) => ticket.workbenchHref
    )?.workbenchHref;
    if (!ticketHref) {
      throw new Error('No live GRC ticket workbench found for test account.');
    }
    route = ticketHref;
    await assertPage(page, route, 'Ticket workbench');

    console.log(
      'Uptime route smoke passed: dashboard, lesson, ticket workbench.'
    );
  } catch (error) {
    await reportFailure(route, error);
    throw error;
  } finally {
    await browser.close();
    await posthog?.shutdown();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
