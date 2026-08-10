import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { QueueVolumeSparkline } from '@/components/dashboard/QueueVolumeSparkline';
import { SystemsStatusPanel } from '@/components/dashboard/SystemsStatusPanel';
import {
  FilteredTrackSection,
  TrackModuleTabs,
} from '@/components/dashboard/TrackModuleTabs';
import { LessonCard } from '@/components/LessonCard';
import { SlaComplianceStat } from '@/components/tickets/SlaComplianceStat';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  getAppShellContext,
  mapLessonProgressStatus,
} from '@/lib/auth/appShell';
import { buildQueueVolumeSeries } from '@/lib/dashboard/queueVolume';
import { resolveTrackFilter } from '@/lib/dashboard/resolveTrackFilter';
import { getSystemsStatus } from '@/lib/dashboard/systemsStatus';
import { createClient } from '@/lib/supabase/server';
import type { SlaResolutionInput } from '@/lib/tickets/sla';
import { formatWelcomeBack } from '@/lib/users/displayName';
import type { LessonType } from '@/types';

export const metadata: Metadata = {
  title: 'Dashboard',
  description: 'Your enrolled training tracks and lesson progress.',
};

type EnrolledTrack = {
  id: string;
  slug: string;
  name: string;
};

type TrackLesson = {
  id: string;
  track_id: string;
  tier: string;
  lesson_type: string;
  sort_order: number;
  title: string;
};

type TicketProgressJoin = {
  ticket_id: string;
  status: string;
  started_at: string | null;
  resolved_at: string | null;
  tickets:
    | { id: string; track_id: string; sla_minutes: number }
    | { id: string; track_id: string; sla_minutes: number }[]
    | null;
};

type DashboardPageProps = {
  searchParams: Promise<{ track?: string }> | { track?: string };
};

export default async function DashboardPage({
  searchParams,
}: DashboardPageProps) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    redirect('/sign-in');
  }

  const { user } = await getAppShellContext();

  const { data: appUser } = await supabase
    .from('users')
    .select('id')
    .eq('id', authUser.id)
    .maybeSingle();

  if (!appUser) {
    redirect('/checkout');
  }

  const { data: enrollments, error: enrollmentError } = await supabase
    .from('track_enrollments')
    .select('track_id, tracks ( id, slug, name )')
    .eq('student_id', appUser.id)
    .eq('status', 'active');

  if (enrollmentError) {
    throw new Error(`Failed to load enrollments: ${enrollmentError.message}`);
  }

  const enrolledTracks = (enrollments ?? [])
    .map((row) => {
      const track = row.tracks;
      if (!track) return null;
      return (Array.isArray(track) ? track[0] : track) as EnrolledTrack | null;
    })
    .filter((track): track is EnrolledTrack => track !== null);

  const trackIds = enrolledTracks.map((track) => track.id);
  const activeTrackSlug = resolveTrackFilter(
    typeof params.track === 'string' ? params.track : undefined,
    enrolledTracks.map((track) => track.slug)
  );

  const [
    { data: allLessons, error: lessonsError },
    { data: ticketRows },
    { data: ticketProgressRows, error: ticketProgressError },
  ] = await Promise.all([
    trackIds.length > 0
      ? supabase
          .from('lessons')
          .select('id, track_id, tier, lesson_type, sort_order, title')
          .in('track_id', trackIds)
          .order('sort_order', { ascending: true })
      : Promise.resolve({ data: [] as TrackLesson[], error: null }),
    trackIds.length > 0
      ? supabase.from('tickets').select('track_id').in('track_id', trackIds)
      : Promise.resolve({ data: [] as { track_id: string }[], error: null }),
    supabase
      .from('ticket_progress')
      .select(
        'ticket_id, status, started_at, resolved_at, tickets ( id, track_id, sla_minutes )'
      )
      .eq('student_id', appUser.id),
  ]);

  if (lessonsError) {
    throw new Error(`Failed to load lessons: ${lessonsError.message}`);
  }
  if (ticketProgressError) {
    throw new Error(
      `Failed to load ticket progress: ${ticketProgressError.message}`
    );
  }

  const lessonIds = (allLessons ?? []).map((lesson) => lesson.id);

  const { data: progressRows } =
    lessonIds.length > 0
      ? await supabase
          .from('lesson_progress')
          .select('lesson_id, status')
          .eq('student_id', appUser.id)
          .in('lesson_id', lessonIds)
      : { data: [] };

  const progressByLesson = new Map(
    (progressRows ?? []).map((row) => [row.lesson_id, row.status])
  );

  const lessonsByTrack = new Map<string, TrackLesson[]>();
  for (const lesson of allLessons ?? []) {
    const existing = lessonsByTrack.get(lesson.track_id) ?? [];
    existing.push(lesson);
    lessonsByTrack.set(lesson.track_id, existing);
  }

  const trackIdsWithTickets = new Set(
    (ticketRows ?? []).map((row) => row.track_id as string)
  );

  const queueSeries = buildQueueVolumeSeries(ticketProgressRows ?? [], {
    days: 14,
  });
  const systems = getSystemsStatus(appUser.id);

  const slaItems: SlaResolutionInput[] = (
    (ticketProgressRows ?? []) as TicketProgressJoin[]
  )
    .filter((row) => row.status === 'resolved')
    .map((row) => {
      const ticket = Array.isArray(row.tickets) ? row.tickets[0] : row.tickets;
      return {
        startedAt: row.started_at,
        resolvedAt: row.resolved_at,
        slaMinutes: ticket?.sla_minutes ?? NaN,
      };
    });

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="mt-1 text-muted-foreground">
          {formatWelcomeBack(user?.name)} Continue your enrolled tracks below.
        </p>
        {!user?.name ? (
          <p className="mt-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            Add a preferred name so we can greet you properly.{' '}
            <Link
              href="/account"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Set preferred name
            </Link>
          </p>
        ) : null}
      </header>

      {enrolledTracks.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center shadow-sm">
          <h2 className="text-lg font-semibold">No active enrollments</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Enroll in a training track to access lessons and track your
            progress.
          </p>
          <Button render={<Link href="/checkout" />} className="mt-4">
            Browse tracks
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <section
            aria-label="Operations overview"
            className="grid gap-3 sm:grid-cols-3"
          >
            <QueueVolumeSparkline series={queueSeries} />
            <SystemsStatusPanel systems={systems} />
            <div className="flex min-h-[5.5rem] flex-col justify-between rounded-md border border-border bg-card px-3 py-2.5 shadow-sm transition-shadow hover:shadow-md">
              <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                SLA compliance
              </p>
              <SlaComplianceStat
                items={slaItems}
                className="mt-2 border-0 bg-transparent p-0"
              />
            </div>
          </section>

          <TrackModuleTabs
            tracks={enrolledTracks.map((track) => ({
              id: track.id,
              slug: track.slug,
              name: track.name,
              hasTickets: trackIdsWithTickets.has(track.id),
            }))}
            activeSlug={activeTrackSlug}
          >
            {enrolledTracks.map((track) => {
              const lessons = lessonsByTrack.get(track.id) ?? [];
              const tiers = Array.from(
                new Set(lessons.map((lesson) => lesson.tier))
              );
              const hasTickets = trackIdsWithTickets.has(track.id);

              return (
                <FilteredTrackSection key={track.id} trackSlug={track.slug}>
                  <section aria-labelledby={`track-${track.id}`}>
                    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                      <div>
                        <h2
                          id={`track-${track.id}`}
                          className="text-lg font-semibold"
                        >
                          {track.name}
                        </h2>
                        <p className="mt-0.5 font-mono text-sm text-muted-foreground">
                          /tracks/{track.slug}
                        </p>
                      </div>
                      {hasTickets ? (
                        <Link
                          href={`/tracks/${track.slug}/console`}
                          className="font-mono text-xs text-primary underline-offset-2 hover:underline"
                        >
                          Ticket console
                        </Link>
                      ) : null}
                    </div>

                    {lessons.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No lessons published for this track yet.
                      </p>
                    ) : (
                      <div className="space-y-4">
                        {tiers.map((tier, index) => {
                          const tierLessons = lessons.filter(
                            (lesson) => lesson.tier === tier
                          );

                          return (
                            <div key={tier}>
                              {index > 0 ? (
                                <Separator className="mb-4" />
                              ) : null}
                              <h3 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted-foreground">
                                Tier {tier}
                              </h3>
                              <div className="grid gap-3 sm:grid-cols-2">
                                {tierLessons.map((lesson) => (
                                  <LessonCard
                                    key={lesson.id}
                                    id={lesson.id}
                                    trackSlug={track.slug}
                                    title={lesson.title}
                                    status={mapLessonProgressStatus(
                                      progressByLesson.get(lesson.id)
                                    )}
                                    lessonType={
                                      lesson.lesson_type as LessonType
                                    }
                                    tier={lesson.tier}
                                  />
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>
                </FilteredTrackSection>
              );
            })}
          </TrackModuleTabs>
        </div>
      )}
    </div>
  );
}
