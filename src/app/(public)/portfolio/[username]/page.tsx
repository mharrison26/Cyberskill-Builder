import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { FindingCard } from '@/components/FindingCard';
import { TicketResolutionCard } from '@/components/portfolio/TicketResolutionCard';
import {
  getPublicPortfolioItems,
  getStudentActiveTracks,
  toFindingStateDisplay,
} from '@/lib/portfolio/getPublicPortfolio';
import {
  displayNameFromEmail,
  getUserByUsername,
} from '@/lib/users/getUserByUsername';

type PortfolioPageProps = {
  params: { username: string };
};

export async function generateMetadata({
  params,
}: PortfolioPageProps): Promise<Metadata> {
  const user = await getUserByUsername(params.username);

  if (!user) {
    return {
      title: 'Portfolio not found',
    };
  }

  const name = displayNameFromEmail(user.email);

  return {
    title: `${name} — Portfolio`,
    description: `Public compliance portfolio for ${name}`,
  };
}

export default async function PublicPortfolioPage({
  params,
}: PortfolioPageProps) {
  const user = await getUserByUsername(params.username);

  if (!user) {
    notFound();
  }

  const [tracks, items] = await Promise.all([
    getStudentActiveTracks(user.id),
    getPublicPortfolioItems(user.id),
  ]);

  const displayName = displayNameFromEmail(user.email);

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <header className="border-b border-border pb-8">
        <h1 className="text-2xl font-semibold">{displayName}</h1>
        {user.username ? (
          <p className="mt-1 text-sm text-muted-foreground">@{user.username}</p>
        ) : null}
      </header>

      <section className="mt-8" aria-labelledby="tracks-heading">
        <h2 id="tracks-heading" className="text-lg font-semibold">
          Enrolled tracks
        </h2>
        {tracks.length > 0 ? (
          <ul className="mt-4 space-y-2">
            {tracks.map((track) => (
              <li
                key={track.trackId}
                className="rounded-md border border-border bg-card px-4 py-3 text-sm"
              >
                <span className="font-medium">{track.trackName}</span>
                <span className="ml-2 text-muted-foreground">— Active</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            No active track enrollments.
          </p>
        )}
      </section>

      <section className="mt-10" aria-labelledby="portfolio-heading">
        <h2 id="portfolio-heading" className="text-lg font-semibold">
          Portfolio artifacts
        </h2>
        {items.length > 0 ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {items.map((item) =>
              item.itemKind === 'ticket_resolution' ? (
                <TicketResolutionCard
                  key={item.id}
                  title={item.title}
                  scoreStatus={item.scoreStatus}
                  dcwfCode={item.dcwfCode}
                  dcwfTitle={item.dcwfTitle}
                  narrative={item.narrative}
                  tier={item.tier}
                  ticketType={item.ticketType}
                  isFlagship={item.isFlagship}
                />
              ) : (
                <FindingCard
                  key={item.id}
                  controlId={item.controlId ?? item.title}
                  findingState={toFindingStateDisplay(
                    item.findingState ?? 'accepted'
                  )}
                  dcwfCode={item.dcwfCode}
                  dcwfTitle={item.dcwfTitle}
                  narrative={item.narrative}
                  oscalFinding={{
                    id: item.id,
                    control_id: item.controlId ?? item.title,
                    finding_state: item.findingState ?? 'accepted',
                    student_narrative: item.studentNarrative,
                    observation: item.observation,
                  }}
                />
              )
            )}
          </div>
        ) : (
          <p className="mt-6 rounded-md border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
            No public artifacts yet. Completed assessments and ticket
            resolutions marked public will appear here.
          </p>
        )}
      </section>
    </div>
  );
}
