import type { Metadata } from 'next';
import Link from 'next/link';

import { LegalDraftBanner } from '@/components/layout/LegalDraftBanner';

export const metadata: Metadata = {
  title: 'Subprocessors',
  description:
    'Third-party services that process student data for CyberSkill Builder.',
};

const subprocessors = [
  {
    name: 'Supabase',
    role: 'Database, authentication, and file storage',
    dataTouched:
      'Account identifiers (name, email), organization/tenant membership, authentication credentials and session data, training activity, assessment artifacts, portfolio content, and uploaded files (including defense recordings where applicable).',
    dpaHref: 'https://supabase.com/legal/dpa',
    dpaLabel: 'Supabase Data Processing Addendum',
  },
  {
    name: 'Stripe',
    role: 'Payment processing',
    dataTouched:
      'Billing contact details, payment method metadata, transaction amounts, and related payment records. Full card numbers are handled by Stripe and are not stored on our servers.',
    dpaHref: 'https://stripe.com/legal/dpa',
    dpaLabel: 'Stripe Data Processing Agreement',
  },
  {
    name: 'Fly.io',
    role: 'Ephemeral sandbox compute',
    dataTouched:
      'Short-lived lab/sandbox workloads and related runtime telemetry. Sandboxes are ephemeral and may process session or exercise inputs needed to run training environments; they are not used as a long-term student data store.',
    dpaHref: 'https://fly.io/compliance/',
    dpaLabel: 'Fly.io Compliance (DPA)',
  },
  {
    name: 'Vercel',
    role: 'Application hosting and platform logs',
    dataTouched:
      'HTTP request metadata (such as IP address, user agent, and request paths), deployment and runtime logs, and other operational data generated while serving the platform.',
    dpaHref: 'https://vercel.com/legal/dpa',
    dpaLabel: 'Vercel Data Processing Addendum',
  },
  {
    name: 'Sentry',
    role: 'Error and performance telemetry',
    dataTouched:
      'Application error reports, stack traces, device/browser context, and related diagnostic metadata. Telemetry may incidentally include user identifiers or request context present in an error event.',
    dpaHref: 'https://sentry.io/legal/dpa/',
    dpaLabel: 'Sentry Data Processing Addendum',
  },
] as const;

export default function SubprocessorsPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <LegalDraftBanner />

      <header className="mt-8">
        <h1 className="text-2xl font-semibold tracking-tight">
          Subprocessors
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Last updated: August 9, 2026 (draft)
        </p>
      </header>

      <div className="prose prose-sm mt-8 max-w-none text-muted-foreground prose-headings:font-semibold prose-headings:text-foreground prose-headings:tracking-tight">
        <section>
          <h2>Overview</h2>
          <p>
            CyberSkill Builder uses the following third-party subprocessors to
            operate the platform. Each vendor may process student or account
            data as described below, subject to our agreements with that vendor
            and applicable law. For general privacy practices, see our{' '}
            <Link href="/privacy">Privacy Policy</Link>.
          </p>
        </section>

        {subprocessors.map((vendor) => (
          <section key={vendor.name}>
            <h2>{vendor.name}</h2>
            <p>
              <strong>Service:</strong> {vendor.role}
            </p>
            <p>
              <strong>Data processed:</strong> {vendor.dataTouched}
            </p>
            <p>
              <strong>Vendor DPA / security:</strong>{' '}
              <a
                href={vendor.dpaHref}
                target="_blank"
                rel="noopener noreferrer"
              >
                {vendor.dpaLabel}
              </a>
            </p>
          </section>
        ))}

        <section>
          <h2>Updates</h2>
          <p>
            We may update this list when we add or remove subprocessors. Material
            changes will be reflected on this page with an updated revision date.
          </p>
        </section>

        <section>
          <h2>Contact</h2>
          <p>
            For questions about subprocessors or data processing, contact{' '}
            <a href="mailto:privacy@cyberskillbuilder.com">
              privacy@cyberskillbuilder.com
            </a>
            . This address is placeholder only and must be updated before
            launch.
          </p>
        </section>
      </div>
    </div>
  );
}
