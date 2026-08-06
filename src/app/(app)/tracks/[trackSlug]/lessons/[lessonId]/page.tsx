import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ArtifactLabLesson } from '@/components/lessons/ArtifactLabLesson';
import { ConceptualLesson } from '@/components/lessons/ConceptualLesson';
import { ToolWalkthroughLesson } from '@/components/lessons/ToolWalkthroughLesson';
import { requireEnrollment } from '@/lib/auth/requireEnrollment';
import { createClient } from '@/lib/supabase/server';
import type { Lesson, LessonType } from '@/types';

type LessonPageProps = {
  params: { trackSlug: string; lessonId: string };
};

export async function generateMetadata({
  params,
}: LessonPageProps): Promise<Metadata> {
  const supabase = await createClient();
  const { data: lesson } = await supabase
    .from('lessons')
    .select('title')
    .eq('id', params.lessonId)
    .maybeSingle();

  return {
    title: lesson?.title ?? 'Lesson',
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

  const lessonType = lesson.lesson_type as LessonType;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <p className="text-sm font-medium text-muted-foreground">{track.name}</p>

      {lessonType === 'conceptual' || lessonType === 'catalog_lab' ? (
        <ConceptualLesson lesson={lesson} />
      ) : null}

      {lessonType === 'artifact_lab' ? (
        <ArtifactLabLesson lesson={lesson} />
      ) : null}

      {lessonType === 'tool_walkthrough' ? (
        <ToolWalkthroughLesson lesson={lesson} />
      ) : null}
    </div>
  );
}
