import type { Metadata } from 'next';
import { Clock3, LoaderCircle } from 'lucide-react';
import { notFound } from 'next/navigation';

import { GradingResult } from '@/components/GradingResult';
import { ArtifactLabLesson } from '@/components/lessons/ArtifactLabLesson';
import { CatalogLabLesson } from '@/components/lessons/CatalogLabLesson';
import { ConceptualLesson } from '@/components/lessons/ConceptualLesson';
import { ToolWalkthroughLesson } from '@/components/lessons/ToolWalkthroughLesson';
import { SimulatedDataBanner } from '@/components/SimulatedDataBanner';
import { requireEnrollment } from '@/lib/auth/requireEnrollment';
import {
  extractMemoFromSubmission,
  resolveLessonGradingPhase,
} from '@/lib/grading/lessonGradingStatus';
import { isDodAdjacentTenant } from '@/lib/tenants/isDodAdjacentTenant';
import { isLessonGradedStatus } from '@/lib/status';
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

  const { track, user } = await requireEnrollment(
    supabase,
    trackSlug,
    returnTo
  );

  const showSimulatedDataBanner = await isDodAdjacentTenant(
    supabase,
    user.tenant_id
  );

  const { data: lesson, error: lessonError } = await supabase
    .from('lessons')
    .select(
      'id, track_id, tier, lesson_type, sort_order, title, learning_objectives, dcwf_code, content, depends_on_lesson_id'
    )
    .eq('id', lessonId)
    .maybeSingle<Lesson>();

  if (lessonError || !lesson || lesson.track_id !== track.id) {
    notFound();
  }

  const lessonType = lesson.lesson_type as LessonType;

  const { data: progress } = await supabase
    .from('lesson_progress')
    .select(
      'status, submission, grading_error, submitted_at, grading_started_at, graded_at'
    )
    .eq('student_id', user.id)
    .eq('lesson_id', lessonId)
    .maybeSingle();

  const progressStatus = progress?.status ?? 'not_started';
  const isGraded = isLessonGradedStatus(progressStatus);
  const gradingError =
    typeof progress?.grading_error === 'string' ? progress.grading_error : null;
  const isSubmitted = progressStatus === 'submitted';
  const isGradingFailed = isSubmitted && Boolean(gradingError?.trim());

  let finding: {
    id: string;
    finding_state: string;
    observation: {
      feedback?: string;
      strengths?: string;
      gaps?: string;
    } | null;
    control_id: string;
    student_narrative: string | null;
    dcwf_code?: string | null;
    created_at?: string;
    is_public: boolean;
  } | null = null;

  if (isGraded || isSubmitted) {
    const { data: latestFinding } = await supabase
      .from('oscal_findings')
      .select(
        'id, finding_state, observation, control_id, student_narrative, dcwf_code, created_at, is_public'
      )
      .eq('student_id', user.id)
      .eq('lesson_id', lessonId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    finding = latestFinding;
  }

  const conceptualPhase = resolveLessonGradingPhase({
    status: progressStatus,
    gradingError,
    hasFinding: Boolean(finding) && isGraded,
  });
  const conceptualMemo =
    extractMemoFromSubmission(progress?.submission) ??
    (typeof finding?.student_narrative === 'string'
      ? finding.student_narrative
      : null);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {showSimulatedDataBanner ? <SimulatedDataBanner /> : null}

      <p className="text-sm font-medium text-muted-foreground">{track.name}</p>

      {isSubmitted && !isGradingFailed ? (
        <div
          role="status"
          className="flex items-start gap-3 rounded-lg border border-status-insufficient-foreground/20 bg-status-insufficient px-4 py-3 text-sm text-status-insufficient-foreground"
        >
          <Clock3 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-medium">Awaiting grading</p>
            <p className="mt-0.5 text-status-insufficient-foreground/90">
              Your submission is saved. Results will appear here once grading is
              complete.
            </p>
          </div>
        </div>
      ) : null}

      {isGradingFailed ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm"
        >
          <p className="font-medium text-destructive">
            Grading failed — your answer is saved
          </p>
          <p className="mt-1 text-muted-foreground">
            {gradingError ??
              'Grading failed, your answer is saved. You can retry from the memo form below.'}
          </p>
        </div>
      ) : null}

      {isGraded ? (
        <section
          aria-labelledby="grading-results-heading"
          className="space-y-3"
        >
          <h2 id="grading-results-heading" className="text-xl font-semibold">
            Grading Results
          </h2>
          {finding ? (
            <GradingResult
              finding={finding}
              findingId={finding.id}
              isPublic={finding.is_public}
              canToggle
            />
          ) : (
            <div
              role="status"
              className="flex items-start gap-3 rounded-lg border border-border bg-muted/50 px-4 py-3 text-sm"
            >
              <LoaderCircle
                className="mt-0.5 size-4 shrink-0 animate-spin text-muted-foreground"
                aria-hidden="true"
              />
              <div>
                <p className="font-medium text-foreground">
                  Grading in progress
                </p>
                <p className="mt-0.5 text-muted-foreground">
                  Your submission has been received. Detailed feedback will
                  appear here shortly.
                </p>
              </div>
            </div>
          )}
        </section>
      ) : null}

      {lessonType === 'conceptual' ? (
        <ConceptualLesson
          lesson={lesson}
          content={
            typeof lesson.content?.body === 'string' &&
            lesson.content.body.trim()
              ? lesson.content.body
              : typeof lesson.content?.scenarioBrief === 'string' &&
                  lesson.content.scenarioBrief.trim()
                ? `## Scenario\n\n${lesson.content.scenarioBrief}`
                : null
          }
          initialMemo={conceptualMemo}
          initialPhase={conceptualPhase}
          initialGradingError={gradingError}
          initialSubmittedAt={progress?.submitted_at ?? null}
        />
      ) : null}

      {lessonType === 'catalog_lab' ? (
        <CatalogLabLesson
          lesson={lesson}
          content={
            typeof lesson.content?.body === 'string' &&
            lesson.content.body.trim()
              ? lesson.content.body
              : typeof lesson.content?.scenarioBrief === 'string' &&
                  lesson.content.scenarioBrief.trim()
                ? `## Scenario\n\n${lesson.content.scenarioBrief}`
                : null
          }
          catalogHref={`/tracks/${trackSlug}/catalog`}
        />
      ) : null}

      {lessonType === 'artifact_lab' ? (
        <ArtifactLabLesson lesson={lesson} />
      ) : null}

      {lessonType === 'tool_walkthrough' ? (
        <ToolWalkthroughLesson lesson={lesson} />
      ) : null}

      {lessonType !== 'conceptual' &&
      lessonType !== 'catalog_lab' &&
      lessonType !== 'artifact_lab' &&
      lessonType !== 'tool_walkthrough' ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm"
        >
          This lesson type ({String(lesson.lesson_type)}) has no interactive
          work area yet. Please contact support.
        </div>
      ) : null}
    </div>
  );
}
