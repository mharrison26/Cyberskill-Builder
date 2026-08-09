import type { Metadata } from 'next';

import { FindingCard } from '@/components/FindingCard';
import { TicketResolutionCard } from '@/components/portfolio/TicketResolutionCard';
import { SimulatedDataBanner } from '@/components/SimulatedDataBanner';
import { getMyPortfolioItems } from '@/lib/portfolio/getMyPortfolio';
import { toFindingStateDisplay } from '@/lib/portfolio/getPublicPortfolio';
import { MOCK_FINDINGS, MOCK_USER } from '@/lib/mock-data';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Capability ledger',
  description:
    'Immutable, verifiable ledger of practical capability — control findings mapped to DoD 8140/8570.',
};

export default async function MyPortfolioPage() {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  let displayName = MOCK_USER.name;
  let usingMock = true;
  let items: Awaited<ReturnType<typeof getMyPortfolioItems>> = [];

  if (authUser) {
    const { data: profile } = await supabase
      .from('users')
      .select('id, email')
      .eq('id', authUser.id)
      .maybeSingle();

    if (profile) {
      displayName =
        profile.email.split('@')[0]
          ?.split(/[._-]+/)
          .filter(Boolean)
          .map((part: string) => part.charAt(0).toUpperCase() + part.slice(1))
          .join(' ') ?? MOCK_USER.name;
      items = await getMyPortfolioItems(supabase, profile.id);
      usingMock = items.length === 0;
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      {usingMock ? <SimulatedDataBanner /> : null}

      <header className="space-y-2 border-b border-border pb-6">
        <p className="text-sm font-medium text-muted-foreground">
          Verifiable capability ledger
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">My Portfolio</h1>
        <p className="max-w-2xl text-muted-foreground">
          {displayName} — machine-readable findings and ticket resolutions
          mapped to DCWF / DoD 8570 work roles. Each entry carries a timestamp,
          work-role code, and downloadable OSCAL record.
        </p>
      </header>

      <section aria-labelledby="ledger-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="ledger-heading" className="text-lg font-semibold">
              Ledger entries
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {usingMock
                ? `${MOCK_FINDINGS.length} sample artifacts (no live portfolio items yet)`
                : `${items.length} recorded artifacts`}
            </p>
          </div>
        </div>

        {usingMock ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {MOCK_FINDINGS.map((finding) => (
              <FindingCard
                key={finding.id}
                id={finding.id}
                controlId={finding.controlId}
                findingState={finding.findingState}
                dcwfCode={finding.dcwfCode}
                dcwfTitle={finding.dcwfTitle}
                narrative={finding.narrative}
                createdAt={finding.createdAt}
                isPublic={finding.isPublic ?? false}
                defense={finding.defense}
                allowRecordDefense
                promptQuestions={finding.promptQuestions}
                oscalFinding={{
                  id: finding.id,
                  control_id: finding.controlId,
                  finding_state: finding.findingState,
                  student_narrative: finding.narrative,
                  observation: { feedback: finding.narrative },
                }}
              />
            ))}
          </div>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {items.map((item) =>
              item.itemKind === 'ticket_resolution' ? (
                <TicketResolutionCard
                  key={item.id}
                  id={item.id}
                  title={item.title}
                  scoreStatus={item.scoreStatus}
                  dcwfCode={item.dcwfCode}
                  dcwfTitle={item.dcwfTitle}
                  narrative={item.narrative}
                  tier={item.tier}
                  ticketType={item.ticketType}
                  isFlagship={item.isFlagship}
                  createdAt={item.createdAt}
                  isPublic={item.isPublic}
                  defense={item.defense}
                  allowRecordDefense
                  trackId={item.trackId}
                  relatedFindingId={item.relatedFindingId}
                  promptQuestions={item.promptQuestions}
                />
              ) : (
                <FindingCard
                  key={item.id}
                  id={item.id}
                  controlId={item.controlId ?? item.title}
                  findingState={toFindingStateDisplay(
                    item.findingState ?? 'accepted'
                  )}
                  dcwfCode={item.dcwfCode}
                  dcwfTitle={item.dcwfTitle}
                  narrative={item.narrative}
                  createdAt={item.createdAt}
                  isPublic={item.isPublic}
                  defense={item.defense}
                  allowRecordDefense
                  trackId={item.trackId}
                  relatedFindingId={item.relatedFindingId}
                  promptQuestions={item.promptQuestions}
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
        )}
      </section>
    </div>
  );
}
