import type { SupabaseClient } from '@supabase/supabase-js';

import {
  extractControlIdsFromSubmission,
  resolvePoamSourceLessonTitles,
  summarizeL02Submission,
  type PoamSourceFinding,
  type PoamSourceFindingGap,
} from '@/lib/grc/poamSourceFindingsShared';

export {
  DEFAULT_IAM_LESSON_TITLE,
  DEFAULT_L02_LESSON_TITLE,
  buildPoamSourceGapsMessage,
  resolvePoamSourceLessonTitles,
  summarizeL02Submission,
  toPriorFindingsSeedShape,
  usesStudentPoamSourceFindings,
  type PoamSourceFinding,
  type PoamSourceFindingGap,
} from '@/lib/grc/poamSourceFindingsShared';

/**
 * Compile the two GRC-04 POA&M source findings from the student's own history:
 *   1. IAM lab (Evidence Collection & Validation) → oscal_findings
 *   2. L02 (Navigating NIST SP 800-53) → lesson_progress.submission
 *
 * When useStudentSourceFindings is set on the ticket, generic seed
 * prior_findings are NOT used as a fallback — missing work surfaces as an
 * empty / prerequisite state instead.
 */

export type CompiledPoamSourceFindings = {
  findings: PoamSourceFinding[];
  source: 'student_history' | 'empty';
  gaps: PoamSourceFindingGap[];
  complete: boolean;
  iamLessonTitle: string;
  l02LessonTitle: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function summarizeIamFinding(row: {
  control_id: string | null;
  finding_state: string | null;
  student_narrative: string | null;
  observation: unknown;
}): string {
  const narrative = asNonEmptyString(row.student_narrative);
  if (narrative) return narrative;

  const observation = isPlainObject(row.observation) ? row.observation : null;
  const feedback = asNonEmptyString(observation?.feedback);
  if (feedback) return feedback;

  const control = asNonEmptyString(row.control_id)?.toUpperCase() ?? 'control';
  const state = asNonEmptyString(row.finding_state) ?? 'open';
  return `Graded ${control} finding (${state.replace(/_/g, ' ')}).`;
}

export type CompilePoamSourceFindingsInput = {
  supabase: SupabaseClient;
  studentId: string;
  trackId: string;
  initialState?: Record<string, unknown> | null;
};

async function loadLessonByTitle(
  supabase: SupabaseClient,
  trackId: string,
  title: string
): Promise<{ id: string; title: string } | null> {
  const { data, error } = await supabase
    .from('lessons')
    .select('id, title')
    .eq('track_id', trackId)
    .eq('title', title)
    .maybeSingle();

  if (error) {
    console.warn('[compilePoamSourceFindings] lesson load:', error.message);
    return null;
  }
  if (!data?.id) return null;
  return { id: data.id as string, title: (data.title as string) ?? title };
}

/**
 * Join the student's IAM oscal_findings row and L02 lesson_progress submission
 * into the two POA&M source findings.
 */
export async function compilePoamSourceFindings(
  input: CompilePoamSourceFindingsInput
): Promise<CompiledPoamSourceFindings> {
  const { iamLessonTitle, l02LessonTitle } = resolvePoamSourceLessonTitles(
    input.initialState
  );
  const gaps: PoamSourceFindingGap[] = [];
  const findings: PoamSourceFinding[] = [];

  const [iamLesson, l02Lesson] = await Promise.all([
    loadLessonByTitle(input.supabase, input.trackId, iamLessonTitle),
    loadLessonByTitle(input.supabase, input.trackId, l02LessonTitle),
  ]);

  if (!iamLesson) {
    gaps.push({
      key: 'iam',
      lessonTitle: iamLessonTitle,
      message: `Prerequisite lesson "${iamLessonTitle}" was not found on this track.`,
    });
  } else {
    const { data: iamFinding, error: iamError } = await input.supabase
      .from('oscal_findings')
      .select(
        'id, control_id, finding_state, student_narrative, observation, created_at'
      )
      .eq('student_id', input.studentId)
      .eq('lesson_id', iamLesson.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (iamError) {
      console.warn(
        '[compilePoamSourceFindings] iam oscal_findings:',
        iamError.message
      );
    }

    if (!iamFinding?.id) {
      gaps.push({
        key: 'iam',
        lessonTitle: iamLessonTitle,
        message: `Complete "${iamLessonTitle}" and receive a graded finding before drafting this POA&M.`,
      });
    } else {
      findings.push({
        id: iamFinding.id as string,
        controlId:
          typeof iamFinding.control_id === 'string'
            ? iamFinding.control_id
            : undefined,
        title: iamLesson.title,
        summary: summarizeIamFinding({
          control_id:
            typeof iamFinding.control_id === 'string'
              ? iamFinding.control_id
              : null,
          finding_state:
            typeof iamFinding.finding_state === 'string'
              ? iamFinding.finding_state
              : null,
          student_narrative:
            typeof iamFinding.student_narrative === 'string'
              ? iamFinding.student_narrative
              : null,
          observation: iamFinding.observation,
        }),
        findingState:
          typeof iamFinding.finding_state === 'string'
            ? iamFinding.finding_state
            : undefined,
        source: 'iam_oscal_finding',
        lessonTitle: iamLesson.title,
        oscalFindingId: iamFinding.id as string,
        lessonId: iamLesson.id,
      });
    }
  }

  if (!l02Lesson) {
    gaps.push({
      key: 'l02',
      lessonTitle: l02LessonTitle,
      message: `Prerequisite lesson "${l02LessonTitle}" was not found on this track.`,
    });
  } else {
    const { data: l02Progress, error: progressError } = await input.supabase
      .from('lesson_progress')
      .select('id, status, submission, submitted_at')
      .eq('student_id', input.studentId)
      .eq('lesson_id', l02Lesson.id)
      .maybeSingle();

    if (progressError) {
      console.warn(
        '[compilePoamSourceFindings] l02 lesson_progress:',
        progressError.message
      );
    }

    const submissionSummary = summarizeL02Submission(l02Progress?.submission);

    // Accept any stored submission with extractable content. L02 catalog_lab
    // may not yet write a graded status; presence of usable payload is enough.
    if (submissionSummary && l02Progress) {
      const controlIds = extractControlIdsFromSubmission(
        l02Progress.submission
      );
      findings.push({
        id: `l02:${l02Lesson.id}`,
        controlId: controlIds[0],
        title: l02Lesson.title,
        summary: submissionSummary,
        findingState: String(l02Progress.status),
        source: 'l02_lesson_progress',
        lessonTitle: l02Lesson.title,
        oscalFindingId: null,
        lessonId: l02Lesson.id,
        lessonProgressId: l02Progress.id as string,
      });
    } else {
      // Secondary: graded oscal_findings for L02 if catalog lab later writes them.
      const { data: l02Finding, error: l02FindingError } = await input.supabase
        .from('oscal_findings')
        .select(
          'id, control_id, finding_state, student_narrative, observation, created_at'
        )
        .eq('student_id', input.studentId)
        .eq('lesson_id', l02Lesson.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (l02FindingError) {
        console.warn(
          '[compilePoamSourceFindings] l02 oscal_findings:',
          l02FindingError.message
        );
      }

      if (l02Finding?.id) {
        findings.push({
          id: l02Finding.id as string,
          controlId:
            typeof l02Finding.control_id === 'string'
              ? l02Finding.control_id
              : undefined,
          title: l02Lesson.title,
          summary: summarizeIamFinding({
            control_id:
              typeof l02Finding.control_id === 'string'
                ? l02Finding.control_id
                : null,
            finding_state:
              typeof l02Finding.finding_state === 'string'
                ? l02Finding.finding_state
                : null,
            student_narrative:
              typeof l02Finding.student_narrative === 'string'
                ? l02Finding.student_narrative
                : null,
            observation: l02Finding.observation,
          }),
          findingState:
            typeof l02Finding.finding_state === 'string'
              ? l02Finding.finding_state
              : undefined,
          source: 'l02_oscal_finding',
          lessonTitle: l02Lesson.title,
          oscalFindingId: l02Finding.id as string,
          lessonId: l02Lesson.id,
        });
      } else {
        gaps.push({
          key: 'l02',
          lessonTitle: l02LessonTitle,
          message: `Complete "${l02LessonTitle}" (submit your catalog work) before drafting this POA&M.`,
        });
      }
    }
  }

  const complete = findings.length >= 2 && gaps.length === 0;

  return {
    findings,
    source: findings.length > 0 ? 'student_history' : 'empty',
    gaps,
    complete,
    iamLessonTitle,
    l02LessonTitle,
  };
}
