import type { Metadata } from 'next';

import { FindingCard } from '@/components/FindingCard';
import { MOCK_FINDINGS, MOCK_PUBLIC_USER, MOCK_TRACKS } from '@/lib/mock-data';

type PortfolioPageProps = {
  params: { slug: string };
};

export async function generateMetadata({
  params,
}: PortfolioPageProps): Promise<Metadata> {
  const name =
    params.slug === MOCK_PUBLIC_USER.slug
      ? MOCK_PUBLIC_USER.name
      : params.slug.replace(/-/g, ' ');
  return {
    title: `${name} — Portfolio`,
    description: `Public compliance portfolio for ${name}`,
  };
}

export default function PublicPortfolioPage({ params }: PortfolioPageProps) {
  const isKnownUser = params.slug === MOCK_PUBLIC_USER.slug;

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <header className="border-b border-border pb-8">
        <h1 className="text-2xl font-semibold">
          {isKnownUser ? MOCK_PUBLIC_USER.name : params.slug.replace(/-/g, ' ')}
        </h1>
        {isKnownUser ? (
          <>
            <p className="mt-1 text-muted-foreground">
              {MOCK_PUBLIC_USER.title}
            </p>
            <p className="text-sm text-muted-foreground">
              {MOCK_PUBLIC_USER.organization}
            </p>
          </>
        ) : null}
      </header>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Completed tracks</h2>
        <ul className="mt-4 space-y-2">
          {MOCK_TRACKS.map((track) => (
            <li
              key={track.id}
              className="rounded-md border border-border bg-card px-4 py-3 text-sm"
            >
              <span className="font-medium">{track.name}</span>
              <span className="ml-2 text-muted-foreground">— In progress</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Control findings</h2>
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
