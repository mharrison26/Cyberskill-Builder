import type { Metadata } from 'next';

import { AdminGradingTable } from '@/components/admin/AdminGradingTable';
import { isConceptualSubmission } from '@/lib/lessons/conceptualValidation';
import { createClient } from '@/lib/supabase/server';
import type { AdminGradingRow } from '@/types';

export const metadata: Metadata = {
  title: 'Admin — Grading Queue',
  description: 'Review student lesson submissions.',
};

function truncate(text: string, maxLength = 120): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength - 1).trimEnd()}…`;
}

function getObservationFeedback(observation: unknown): string {
  if (
    !observation ||
    typeof observation !== 'object' ||
    Array.isArray(observation)
  ) {
    return '';
  }

  const feedback = (observation as Record<string, unknown>).feedback;
  return typeof feedback === 'string' ? feedback : '';
}

function getSubmissionPreview(
  observation: unknown,
  studentNarrative: string | null
): string {
  if (studentNarrative?.trim()) {
    return studentNarrative;
  }

  if (
    !observation ||
    typeof observation !== 'object' ||
    Array.isArray(observation)
  ) {
    return '';
  }

  const cccer = (observation as Record<string, unknown>).cccer;
  if (!cccer || typeof cccer !== 'object' || Array.isArray(cccer)) {
    return '';
  }

  const values = cccer as Record<string, unknown>;
  const parts = ['condition', 'criteria', 'cause', 'effect', 'recommendation']
    .map((key) => {
      const value = values[key];
      return typeof value === 'string' && value.trim() ? value.trim() : null;
    })
    .filter(Boolean);

  return parts.join(' · ');
}

function getProgressSubmissionText(submission: unknown): string {
  if (isConceptualSubmission(submission)) {
    return submission.memo;
  }

  if (!submission || typeof submission !== 'object') {
    return '';
  }

  const record = submission as Record<string, unknown>;
  if (typeof record.memo === 'string' && record.memo.trim()) {
    return record.memo;
  }
  if (typeof record.explanation === 'string' && record.explanation.trim()) {
    return record.explanation;
  }

  try {
    return JSON.stringify(submission);
  } catch {
    return '';
  }
}

export default async function AdminGradingPage() {
  const supabase = await createClient();

  const [
    { data: findings, error },
    { data: pendingProgress, error: pendingError },
    { data: tracks, error: tracksError },
  ] = await Promise.all([
    supabase
      .from('oscal_findings')
      .select(
        `
      id,
      control_id,
      finding_state,
      observation,
      student_narrative,
      is_reviewed,
      created_at,
      lesson_id,
      student_id,
      student:users!oscal_findings_student_id_fkey(email),
      lesson:lessons!oscal_findings_lesson_id_fkey(title),
      track:tracks!oscal_findings_track_id_fkey(name)
    `
      )
      .order('created_at', { ascending: false }),
    supabase
      .from('lesson_progress')
      .select(
        `
      id,
      status,
      submission,
      grading_error,
      submitted_at,
      student_id,
      lesson_id,
      student:users!lesson_progress_student_id_fkey(email),
      lesson:lessons!lesson_progress_lesson_id_fkey(title, lesson_type, track_id)
    `
      )
      .eq('status', 'submitted')
      .order('submitted_at', { ascending: false }),
    supabase.from('tracks').select('id, name'),
  ]);

  if (error) {
    throw new Error(`Failed to load grading queue: ${error.message}`);
  }

  if (pendingError) {
    throw new Error(
      `Failed to load pending submissions: ${pendingError.message}`
    );
  }

  if (tracksError) {
    throw new Error(`Failed to load tracks: ${tracksError.message}`);
  }

  const trackNameById = new Map(
    (tracks ?? []).map((track) => [track.id as string, track.name as string])
  );

  const findingKeys = new Set(
    (findings ?? []).map(
      (finding) => `${finding.student_id}:${finding.lesson_id}`
    )
  );

  const findingRows: AdminGradingRow[] = (findings ?? []).map((finding) => {
    const student = Array.isArray(finding.student)
      ? finding.student[0]
      : finding.student;
    const lesson = Array.isArray(finding.lesson)
      ? finding.lesson[0]
      : finding.lesson;
    const track = Array.isArray(finding.track)
      ? finding.track[0]
      : finding.track;

    const feedback = getObservationFeedback(finding.observation);
    const submission = getSubmissionPreview(
      finding.observation,
      finding.student_narrative
    );

    return {
      id: finding.id,
      studentEmail: student?.email ?? 'Unknown',
      lessonTitle: lesson?.title ?? 'Unknown lesson',
      trackName: track?.name ?? 'Unknown track',
      controlId: finding.control_id,
      findingState: finding.finding_state,
      aiFeedback: feedback,
      aiFeedbackPreview: truncate(feedback),
      submissionPreview: truncate(submission),
      submissionFull: submission,
      isReviewed: finding.is_reviewed,
      rowKind: 'finding',
      gradingError: null,
    };
  });

  const pendingRows: AdminGradingRow[] = (pendingProgress ?? [])
    .filter((row) => !findingKeys.has(`${row.student_id}:${row.lesson_id}`))
    .map((row) => {
      const student = Array.isArray(row.student) ? row.student[0] : row.student;
      const lesson = Array.isArray(row.lesson) ? row.lesson[0] : row.lesson;
      const trackId =
        lesson && typeof lesson.track_id === 'string' ? lesson.track_id : null;
      const submission = getProgressSubmissionText(row.submission);
      const gradingError =
        typeof row.grading_error === 'string' && row.grading_error.trim()
          ? row.grading_error.trim()
          : null;
      const gradingJobStatus =
        typeof row.grading_job_status === 'string'
          ? row.grading_job_status
          : null;
      const feedback = gradingError
        ? gradingError
        : gradingJobStatus === 'failed'
          ? 'AI grading failed. Re-run from the row details.'
          : 'AI grading has not completed yet.';

      return {
        id: `progress:${row.id}`,
        studentEmail: student?.email ?? 'Unknown',
        lessonTitle: lesson?.title ?? 'Unknown lesson',
        trackName:
          (trackId ? trackNameById.get(trackId) : undefined) ?? 'Unknown track',
        controlId:
          typeof lesson?.lesson_type === 'string'
            ? lesson.lesson_type
            : 'pending',
        findingState:
          gradingError || gradingJobStatus === 'failed'
            ? 'not_satisfied'
            : 'submitted',
        aiFeedback: feedback,
        aiFeedbackPreview: truncate(feedback),
        submissionPreview: truncate(submission),
        submissionFull: submission,
        isReviewed: false,
        rowKind: 'pending_submission' as const,
        gradingError,
      };
    });

  const rows = [...pendingRows, ...findingRows];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Grading Queue</h1>
        <p className="mt-1 text-muted-foreground">
          Student submissions awaiting assessor review. Pending free-text memos
          appear here even before AI grading finishes. AI finding states are
          preliminary.
        </p>
      </header>

      <AdminGradingTable rows={rows} />
    </div>
  );
}
