import type { Metadata } from 'next';

import { FindingCard } from '@/components/FindingCard';
import { MOCK_FINDINGS, MOCK_USER } from '@/lib/mock-data';

export const metadata: Metadata = {
  title: 'My Portfolio',
  description: 'Your control assessment findings and progress.',
};

export default function MyPortfolioPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">My Portfolio</h1>
        <p className="mt-1 text-muted-foreground">
          {MOCK_USER.name} — documented control findings from completed lessons.
        </p>
      </header>

      <section aria-labelledby="findings-heading">
        <h2 id="findings-heading" className="text-lg font-semibold">
          Control findings
        </h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {MOCK_FINDINGS.map((finding) => (
            <FindingCard
              key={finding.id}
              controlId={finding.controlId}
              findingState={finding.findingState}
              dcwfCode={finding.dcwfCode}
              narrative={finding.narrative}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
