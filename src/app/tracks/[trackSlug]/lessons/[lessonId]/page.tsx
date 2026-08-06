import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { Header } from '@/components/Header';
import { requireEnrollment } from '@/lib/auth/requireEnrollment';
import { createClient } from '@/lib/supabase/server';

type LessonPageProps = {
  params: { trackSlug: string; lessonId: string };
};

type Lesson = {
  id: string;
  track_id: string;
  tier: string;
  lesson_type: string;
  sort_order: number;
  title: string;
  learning_objectives: string | null;
  dcwf_code: string | null;
};

export async function generateMetadata({
  params,
}: LessonPageProps): Promise<Metadata> {
  return {
    title: `Lesson — ${params.trackSlug}`,
  };
}

export default async function LessonPage({ params }: LessonPageProps) {
  const { trackSlug, lessonId } = params;
  const returnTo = `/tracks/${trackSlug}/lessons/${lessonId}`;
  const supabase = await createClient();

  const { track } = await requireEnrollment(supabase, trackSlug, returnTo);

  const { data: lesson, error: lessonError } = await supabase
    .from('lessons')
    .select(
      'id, track_id, tier, lesson_type, sort_order, title, learning_objectives, dcwf_code'
    )
    .eq('id', lessonId)
    .maybeSingle<Lesson>();

  if (lessonError || !lesson || lesson.track_id !== track.id) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-gray-50 font-[family-name:var(--font-geist-sans)]">
      <Header />
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-12">
        <div>
          <p className="text-sm font-medium text-gray-500">{track.name}</p>
          <h1 className="mt-1 text-3xl font-semibold text-gray-900">
            {lesson.title}
          </h1>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm font-medium text-gray-500">Tier</dt>
              <dd className="mt-1 text-sm text-gray-900">{lesson.tier}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Type</dt>
              <dd className="mt-1 text-sm text-gray-900">
                {lesson.lesson_type}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Order</dt>
              <dd className="mt-1 text-sm text-gray-900">
                {lesson.sort_order}
              </dd>
            </div>
            {lesson.dcwf_code ? (
              <div>
                <dt className="text-sm font-medium text-gray-500">DCWF code</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {lesson.dcwf_code}
                </dd>
              </div>
            ) : null}
          </dl>

          {lesson.learning_objectives ? (
            <div className="mt-6 border-t border-gray-100 pt-6">
              <h2 className="text-sm font-medium text-gray-500">
                Learning objectives
              </h2>
              <p className="mt-2 whitespace-pre-wrap text-sm text-gray-900">
                {lesson.learning_objectives}
              </p>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
