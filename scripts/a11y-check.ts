/**
 * Accessibility check (WCAG 2.2 AA)
 *
 * Uses @axe-core/playwright (axe-core engine) because dashboard and lesson pages
 * require Supabase cookie auth; @axe-core/cli cannot inject httpOnly session cookies.
 *
 * Environment:
 *   A11Y_BASE_URL          — app origin (default: http://localhost:3000)
 *   A11Y_TEST_EMAIL        — test user email (required for /dashboard and lesson)
 *   A11Y_TEST_PASSWORD     — test user password (required for /dashboard and lesson)
 *   A11Y_LESSON_URL        — optional full or relative lesson URL; otherwise first
 *                            /lessons/ link on the dashboard is used
 *
 * The test user must exist in Supabase auth, have a row in public.users, and an
 * active GRC track enrollment so dashboard and lesson pages render real content.
 *
 * Usage (usually via npm run a11y-check, which builds and starts the server):
 *   A11Y_TEST_EMAIL=... A11Y_TEST_PASSWORD=... npm run a11y-check
 */

import AxeBuilder from '@axe-core/playwright';
import { chromium, type Page } from 'playwright';
import type { Result } from 'axe-core';

/** Cumulative tags required for WCAG 2.2 AA coverage in axe-core. */
const WCAG_22_AA_TAGS = [
  'wcag2a',
  'wcag2aa',
  'wcag21a',
  'wcag21aa',
  'wcag22aa',
] as const;

const BASE_URL = (process.env.A11Y_BASE_URL ?? 'http://localhost:3000').replace(
  /\/$/,
  ''
);

type RouteCheck = {
  label: string;
  url: string;
  requiresAuth: boolean;
};

type ScanFailure = {
  route: string;
  url: string;
  violations: Result[];
};

function requireAuthCredentials(): { email: string; password: string } {
  const email = process.env.A11Y_TEST_EMAIL?.trim();
  const password = process.env.A11Y_TEST_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'A11Y_TEST_EMAIL and A11Y_TEST_PASSWORD are required to scan /dashboard and lesson pages.'
    );
  }

  return { email, password };
}

async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto(`${BASE_URL}/sign-in`, { waitUntil: 'networkidle' });
  await page.locator('#sign-in-email').fill(email);
  await page.locator('#sign-in-password').fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL('**/dashboard', { timeout: 30_000 });
}

async function resolveLessonUrl(page: Page): Promise<string> {
  const explicit = process.env.A11Y_LESSON_URL?.trim();
  if (explicit) {
    return explicit.startsWith('http') ? explicit : `${BASE_URL}${explicit}`;
  }

  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle' });
  const lessonLink = page.locator('a[href*="/lessons/"]').first();
  const href = await lessonLink.getAttribute('href');

  if (!href) {
    throw new Error(
      'No lesson link found on /dashboard. Ensure the a11y test user has an active GRC enrollment, or set A11Y_LESSON_URL.'
    );
  }

  return href.startsWith('http') ? href : `${BASE_URL}${href}`;
}

async function scanRoute(page: Page, route: RouteCheck): Promise<ScanFailure | null> {
  await page.goto(route.url, { waitUntil: 'networkidle' });

  const results = await new AxeBuilder({ page })
    .withTags([...WCAG_22_AA_TAGS])
    .analyze();

  if (results.violations.length === 0) {
    console.log(`PASS  ${route.label}  ${route.url}`);
    return null;
  }

  console.error(`FAIL  ${route.label}  ${route.url}`);
  for (const violation of results.violations) {
    console.error(`  [${violation.impact}] ${violation.id}: ${violation.help}`);
    console.error(`    ${violation.helpUrl}`);
    for (const node of violation.nodes) {
      console.error(`    • ${node.target.join(' ')}`);
      if (node.failureSummary) {
        console.error(`      ${node.failureSummary.replace(/\n/g, '\n      ')}`);
      }
    }
  }

  return {
    route: route.label,
    url: route.url,
    violations: results.violations,
  };
}

async function main(): Promise<void> {
  const failures: ScanFailure[] = [];

  const browser = await chromium.launch({ headless: true });
  const publicContext = await browser.newContext();
  const publicPage = await publicContext.newPage();

  const landingFailure = await scanRoute(publicPage, {
    label: 'Landing page',
    url: `${BASE_URL}/`,
    requiresAuth: false,
  });
  if (landingFailure) failures.push(landingFailure);

  await publicContext.close();

  const { email, password } = requireAuthCredentials();
  const authContext = await browser.newContext();
  const authPage = await authContext.newPage();

  await signIn(authPage, email, password);

  const dashboardFailure = await scanRoute(authPage, {
    label: 'Dashboard',
    url: `${BASE_URL}/dashboard`,
    requiresAuth: true,
  });
  if (dashboardFailure) failures.push(dashboardFailure);

  const lessonUrl = await resolveLessonUrl(authPage);
  const lessonFailure = await scanRoute(authPage, {
    label: 'Lesson page',
    url: lessonUrl,
    requiresAuth: true,
  });
  if (lessonFailure) failures.push(lessonFailure);

  await authContext.close();
  await browser.close();

  if (failures.length > 0) {
    const violationCount = failures.reduce(
      (total, failure) => total + failure.violations.length,
      0
    );
    console.error(
      `\nAccessibility check failed: ${violationCount} WCAG 2.2 AA violation(s) across ${failures.length} route(s).`
    );
    process.exit(1);
  }

  console.log('\nAccessibility check passed (WCAG 2.2 AA, 3 routes).');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
