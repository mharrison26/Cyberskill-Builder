import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { LessonCard } from '@/components/LessonCard';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  getAppShellContext,
  mapLessonProgressStatus,
} from '@/lib/auth/appShell';
import { createClient } from '@/lib/supabase/server';
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

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    redirect('/sign-in');
  }

  const { user } = await getAppShellContext();
  const displayName = user?.name ?? authUser.email ?? 'there';

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

  const { data: allLessons, error: lessonsError } =
    trackIds.length > 0
      ? await supabase
          .from('lessons')
          .select('id, track_id, tier, lesson_type, sort_order, title')
          .in('track_id', trackIds)
          .order('sort_order', { ascending: true })
      : { data: [], error: null };

  if (lessonsError) {
    throw new Error(`Failed to load lessons: ${lessonsError.message}`);
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

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="mt-1 text-muted-foreground">
          Welcome back, {displayName}. Continue your enrolled tracks below.
        </p>
      </header>

      {enrolledTracks.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
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
        enrolledTracks.map((track) => {
          const lessons = lessonsByTrack.get(track.id) ?? [];
          const tiers = Array.from(
            new Set(lessons.map((lesson) => lesson.tier))
          );

          return (
            <section key={track.id} aria-labelledby={`track-${track.id}`}>
              <div className="mb-4">
                <h2 id={`track-${track.id}`} className="text-lg font-semibold">
                  {track.name}
                </h2>
              </div>

              {lessons.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No lessons published for this track yet.
                </p>
              ) : (
                tiers.map((tier, index) => {
                  const tierLessons = lessons.filter(
                    (lesson) => lesson.tier === tier
                  );

                  return (
                    <div key={tier} className="mb-6">
                      {index > 0 ? <Separator className="mb-6" /> : null}
                      <h3 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
                        Tier {tier}
                      </h3>
                      <div className="grid gap-4 sm:grid-cols-2">
                        {tierLessons.map((lesson) => (
                          <LessonCard
                            key={lesson.id}
                            id={lesson.id}
                            title={lesson.title}
                            status={mapLessonProgressStatus(
                              progressByLesson.get(lesson.id)
                            )}
                            lessonType={lesson.lesson_type as LessonType}
                            tier={lesson.tier}
                            href={`/tracks/${track.slug}/lessons/${lesson.id}`}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </section>
          );
        })
      )}
    </div>
  );
}
