import type { Metadata } from 'next';

import { AdminGradingTable } from '@/components/admin/AdminGradingTable';
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

export default async function AdminGradingPage() {
  const supabase = await createClient();

  const { data: findings, error } = await supabase
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
      student:users!oscal_findings_student_id_fkey(email),
      lesson:lessons!oscal_findings_lesson_id_fkey(title),
      track:tracks!oscal_findings_track_id_fkey(name)
    `
    )
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to load grading queue: ${error.message}`);
  }

  const rows: AdminGradingRow[] = (findings ?? []).map((finding) => {
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
    };
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Grading Queue</h1>
        <p className="mt-1 text-muted-foreground">
          Student submissions awaiting assessor review. AI finding states are
          preliminary.
        </p>
      </header>

      <AdminGradingTable rows={rows} />
    </div>
  );
}
