import type { Metadata } from 'next';

import { LegalDraftBanner } from '@/components/layout/LegalDraftBanner';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'Terms governing use of the CyberSkill Builder platform.',
};

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <LegalDraftBanner />

      <header className="mt-8">
        <h1 className="text-2xl font-semibold tracking-tight">
          Terms of Service
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Last updated: August 6, 2026 (draft)
        </p>
      </header>

      <div className="prose prose-sm mt-8 max-w-none text-muted-foreground prose-headings:font-semibold prose-headings:text-foreground prose-headings:tracking-tight">
        <section>
          <h2>Acceptance of Terms</h2>
          <p>
            By accessing or using CyberSkill Builder (&ldquo;the
            Platform&rdquo;), you agree to these Terms of Service. If you do not
            agree, do not use the Platform.
          </p>
        </section>

        <section>
          <h2>Permitted Use</h2>
          <p>
            The Platform is intended for authorized compliance and audit
            training. You agree to use it only for lawful purposes and in
            accordance with applicable organizational policies. Simulated
            environments must not contain classified, controlled unclassified,
            or other sensitive operational data.
          </p>
        </section>

        <section>
          <h2>Account Responsibilities</h2>
          <p>You are responsible for:</p>
          <ul>
            <li>Maintaining the confidentiality of your login credentials.</li>
            <li>All activity that occurs under your account.</li>
            <li>
              Providing accurate registration information and keeping it up to
              date.
            </li>
          </ul>
        </section>

        <section>
          <h2>Training Content and Assessments</h2>
          <p>
            Lessons, labs, and assessment scenarios are provided for educational
            purposes. Completion of training does not constitute certification,
            accreditation, or authorization to perform official audit or
            assessment functions on behalf of any government or private entity.
          </p>
        </section>

        <section>
          <h2>Intellectual Property</h2>
          <p>
            Platform content, including curricula, scenarios, and software, is
            owned by CyberSkill Builder or its licensors. You may not copy,
            redistribute, or create derivative works without prior written
            consent, except as expressly permitted for personal portfolio use.
          </p>
        </section>

        <section>
          <h2>Disclaimers</h2>
          <p>
            THE PLATFORM IS PROVIDED &ldquo;AS IS&rdquo; WITHOUT WARRANTIES OF
            ANY KIND, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR
            A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. Training materials may
            not reflect the latest regulatory guidance and should not be relied
            upon as legal or compliance advice.
          </p>
        </section>

        <section>
          <h2>Limitation of Liability</h2>
          <p>
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, CYBERSKILL BUILDER SHALL NOT
            BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR
            PUNITIVE DAMAGES ARISING FROM YOUR USE OF THE PLATFORM.
          </p>
        </section>

        <section>
          <h2>Termination</h2>
          <p>
            We may suspend or terminate access for violations of these Terms or
            for conduct that threatens platform security or other users. You may
            discontinue use at any time.
          </p>
        </section>

        <section>
          <h2>Changes to These Terms</h2>
          <p>
            We may update these Terms from time to time. Continued use after
            changes become effective constitutes acceptance of the revised
            Terms.
          </p>
        </section>

        <section>
          <h2>Contact</h2>
          <p>
            For questions about these Terms, contact{' '}
            <a href="mailto:legal@cyberskillbuilder.com">
              legal@cyberskillbuilder.com
            </a>
            . This address is placeholder only and must be updated before
            launch.
          </p>
        </section>
      </div>
    </div>
  );
}
