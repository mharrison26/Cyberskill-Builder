/**
 * Smoke-test every live GRC ticket workbench route.
 *
 * Asserts HTTP 200 + rendered scenario content (not the global error page).
 * Requires the same auth setup as a11y-check.
 *
 * Environment:
 *   A11Y_BASE_URL / SMOKE_BASE_URL — app origin (default http://localhost:3000)
 *   A11Y_TEST_EMAIL / SMOKE_TEST_EMAIL
 *   A11Y_TEST_PASSWORD / SMOKE_TEST_PASSWORD
 *
 * Usage:
 *   npm run smoke:grc-tickets
 */

import { chromium, type Page } from 'playwright';

const BASE_URL = (
  process.env.SMOKE_BASE_URL ??
  process.env.A11Y_BASE_URL ??
  'http://localhost:3000'
).replace(/\/$/, '');

function requireAuthCredentials(): { email: string; password: string } {
  const email = (
    process.env.SMOKE_TEST_EMAIL ?? process.env.A11Y_TEST_EMAIL
  )?.trim();
  const password =
    process.env.SMOKE_TEST_PASSWORD ?? process.env.A11Y_TEST_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'SMOKE_TEST_EMAIL/PASSWORD (or A11Y_TEST_*) required for ticket smoke.'
    );
  }
  return { email, password };
}

async function signIn(
  page: Page,
  email: string,
  password: string
): Promise<void> {
  await page.goto(`${BASE_URL}/sign-in`, { waitUntil: 'networkidle' });
  await page.locator('#sign-in-email').fill(email);
  await page.locator('#sign-in-password').fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL('**/dashboard', { timeout: 30_000 });
}

async function main(): Promise<void> {
  const { email, password } = requireAuthCredentials();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await signIn(page, email, password);

    const listRes = await page.request.get(
      `${BASE_URL}/api/tracks/grc/tickets`
    );
    if (!listRes.ok()) {
      throw new Error(`Ticket list failed: HTTP ${listRes.status()}`);
    }
    const payload = (await listRes.json()) as {
      tickets?: Array<{
        id: string;
        workbenchHref?: string | null;
        title?: string;
      }>;
      source?: string;
    };
    const tickets = (payload.tickets ?? []).filter((t) => t.workbenchHref);
    if (tickets.length === 0) {
      throw new Error(
        `No live GRC workbench tickets (source=${payload.source ?? 'unknown'}).`
      );
    }

    const failures: string[] = [];
    for (const ticket of tickets) {
      const href = ticket.workbenchHref!;
      const url = href.startsWith('http') ? href : `${BASE_URL}${href}`;
      const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
      const status = response?.status() ?? 0;
      const body = await page.locator('body').innerText();
      const crashed =
        body.includes('Application error') ||
        body.includes('Could not open this ticket') ||
        body.includes('An error occurred in the Server Components render');
      const hasContent =
        body.includes('Scenario brief') ||
        body.includes('Back to console') ||
        Boolean(ticket.title && body.includes(ticket.title));

      if (status !== 200 || crashed || !hasContent) {
        failures.push(
          `${ticket.id} status=${status} crashed=${crashed} hasContent=${hasContent}`
        );
        continue;
      }
      console.log(`ok ${ticket.id}`);
    }

    if (failures.length > 0) {
      console.error('GRC ticket smoke failures:\n' + failures.join('\n'));
      process.exitCode = 1;
      return;
    }

    console.log(
      `\nGRC ticket smoke passed (${tickets.length} workbench routes, source=${payload.source}).`
    );
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
