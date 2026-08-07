import type { Metadata } from 'next';

import { LegalDraftBanner } from '@/components/layout/LegalDraftBanner';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How CyberSkill Builder collects, uses, and protects your data.',
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <LegalDraftBanner />

      <header className="mt-8">
        <h1 className="text-2xl font-semibold tracking-tight">
          Privacy Policy
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Last updated: August 6, 2026 (draft)
        </p>
      </header>

      <div className="prose prose-sm mt-8 max-w-none text-muted-foreground prose-headings:font-semibold prose-headings:text-foreground prose-headings:tracking-tight">
        <section>
          <h2>Introduction</h2>
          <p>
            CyberSkill Builder (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or
            &ldquo;our&rdquo;) provides compliance and audit training for GRC
            professionals. This Privacy Policy describes how we collect, use,
            and share information when you use our platform.
          </p>
        </section>

        <section>
          <h2>Information We Collect</h2>
          <p>We may collect the following categories of information:</p>
          <ul>
            <li>
              <strong>Account information</strong> — name, email address, and
              organization details provided during registration.
            </li>
            <li>
              <strong>Training activity</strong> — lesson progress, quiz
              responses, and assessment submissions used for grading and
              portfolio features.
            </li>
            <li>
              <strong>Technical data</strong> — IP address, browser type, and
              device information collected automatically for security and
              analytics.
            </li>
          </ul>
        </section>

        <section>
          <h2>How We Use Your Information</h2>
          <p>We use collected information to:</p>
          <ul>
            <li>Provide, maintain, and improve the training platform.</li>
            <li>Authenticate users and manage enrollments.</li>
            <li>Grade assessments and generate portfolio artifacts.</li>
            <li>
              Communicate service updates and respond to support requests.
            </li>
            <li>Detect fraud, abuse, and security incidents.</li>
          </ul>
        </section>

        <section>
          <h2>Cookies and Similar Technologies</h2>
          <p>
            We use cookies and local storage to maintain session state, remember
            preferences, and measure platform usage. You may control cookies
            through your browser settings, though disabling them may limit
            certain features.
          </p>
        </section>

        <section>
          <h2>Data Sharing</h2>
          <p>
            We do not sell personal information. We may share data with service
            providers who assist in hosting, authentication, and analytics,
            subject to contractual confidentiality obligations. We may also
            disclose information when required by law.
          </p>
        </section>

        <section>
          <h2>Data Retention</h2>
          <p>
            We retain account and training data for as long as your account is
            active or as needed to provide services. Assessment artifacts may be
            retained to support portfolio and audit trail features unless
            deletion is requested.
          </p>
        </section>

        <section>
          <h2>Your Rights</h2>
          <p>
            Depending on your jurisdiction, you may have rights to access,
            correct, delete, or export your personal data. Contact us using the
            information below to submit a request.
          </p>
        </section>

        <section>
          <h2>Contact</h2>
          <p>
            For privacy-related questions or requests, contact{' '}
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
