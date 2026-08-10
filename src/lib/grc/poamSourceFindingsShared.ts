import type { PoamPriorFinding } from '@/lib/scoring/ticketUi';

/**
 * Pure helpers for GRC-04 student-history POA&M source findings.
 * Safe to import from client components (no Supabase client).
 */

export const DEFAULT_IAM_LESSON_TITLE = 'Evidence Collection & Validation';
export const DEFAULT_L02_LESSON_TITLE = 'Navigating NIST SP 800-53';

export type PoamSourceFinding = PoamPriorFinding & {
  source: 'iam_oscal_finding' | 'l02_lesson_progress' | 'l02_oscal_finding';
  lessonTitle: string;
  oscalFindingId?: string | null;
  lessonId?: string | null;
  lessonProgressId?: string | null;
};

export type PoamSourceFindingGap = {
  key: 'iam' | 'l02';
  lessonTitle: string;
  message: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function parseStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (typeof value === 'string' && value.trim()) {
    return value
      .split(/[,;\n]+/)
      .map((part) => part.trim())
      .filter(Boolean);
  }
  return [];
}

export function usesStudentPoamSourceFindings(
  initialState: Record<string, unknown> | null | undefined
): boolean {
  if (!isPlainObject(initialState)) return false;
  if (initialState.useStudentSourceFindings === true) return true;
  if (initialState.use_student_source_findings === true) return true;
  if (initialState.sourceFindingsMode === 'student_history') return true;
  if (initialState.source_findings_mode === 'student_history') return true;

  const sources =
    initialState.sourceFindings ?? initialState.source_findings ?? null;
  if (isPlainObject(sources)) {
    if (sources.mode === 'student_history') return true;
    if (
      asNonEmptyString(sources.iamLessonTitle) ||
      asNonEmptyString(sources.iam_lesson_title) ||
      asNonEmptyString(sources.l02LessonTitle) ||
      asNonEmptyString(sources.l02_lesson_title)
    ) {
      return true;
    }
  }
  return false;
}

export function resolvePoamSourceLessonTitles(
  initialState: Record<string, unknown> | null | undefined
): { iamLessonTitle: string; l02LessonTitle: string } {
  const sources = isPlainObject(initialState)
    ? (initialState.sourceFindings ?? initialState.source_findings ?? null)
    : null;
  const sourceObj = isPlainObject(sources) ? sources : null;

  return {
    iamLessonTitle:
      asNonEmptyString(sourceObj?.iamLessonTitle) ??
      asNonEmptyString(sourceObj?.iam_lesson_title) ??
      asNonEmptyString(
        isPlainObject(initialState) ? initialState.iamLessonTitle : null
      ) ??
      DEFAULT_IAM_LESSON_TITLE,
    l02LessonTitle:
      asNonEmptyString(sourceObj?.l02LessonTitle) ??
      asNonEmptyString(sourceObj?.l02_lesson_title) ??
      asNonEmptyString(
        isPlainObject(initialState) ? initialState.l02LessonTitle : null
      ) ??
      DEFAULT_L02_LESSON_TITLE,
  };
}

/** Pure: turn an L02 / catalog_lab lesson_progress.submission into finding text. */
export function summarizeL02Submission(submission: unknown): string | null {
  if (!isPlainObject(submission)) return null;

  const controlIds = parseStringList(
    submission.controlIds ??
      submission.control_ids ??
      submission.iaControls ??
      submission.ia_controls ??
      submission.controls
  );
  const adjacentAc = parseStringList(
    submission.adjacentAcControls ??
      submission.adjacent_ac_controls ??
      submission.acAdjacentControls
  );
  const explanation =
    asNonEmptyString(submission.explanation) ??
    asNonEmptyString(submission.narrative) ??
    asNonEmptyString(submission.mappingCorrection) ??
    asNonEmptyString(submission.mapping_correction) ??
    asNonEmptyString(submission.ac2Ia5Explanation) ??
    asNonEmptyString(submission.ac2_ia5_explanation) ??
    asNonEmptyString(submission.body) ??
    asNonEmptyString(submission.text) ??
    asNonEmptyString(submission.response);

  const condition = asNonEmptyString(submission.condition);
  const criteria = asNonEmptyString(submission.criteria);
  const cause = asNonEmptyString(submission.cause);
  const effect = asNonEmptyString(submission.effect);
  const recommendation = asNonEmptyString(submission.recommendation);

  const parts: string[] = [];

  if (controlIds.length > 0) {
    parts.push(`Control IDs: ${controlIds.join(', ')}`);
  }
  if (adjacentAc.length > 0) {
    parts.push(`Authentication-adjacent AC controls: ${adjacentAc.join(', ')}`);
  }
  if (explanation) {
    parts.push(explanation);
  }

  if (condition || criteria || cause || effect || recommendation) {
    const cccer = [
      condition ? `Condition: ${condition}` : null,
      criteria ? `Criteria: ${criteria}` : null,
      cause ? `Cause: ${cause}` : null,
      effect ? `Effect: ${effect}` : null,
      recommendation ? `Recommendation: ${recommendation}` : null,
    ].filter((p): p is string => Boolean(p));
    parts.push(...cccer);
  }

  if (parts.length === 0) return null;
  return parts.join('\n\n');
}

export function extractControlIdsFromSubmission(submission: unknown): string[] {
  if (!isPlainObject(submission)) return [];
  return parseStringList(
    submission.controlIds ??
      submission.control_ids ??
      submission.iaControls ??
      submission.controls
  );
}

export function toPriorFindingsSeedShape(
  findings: PoamSourceFinding[]
): Array<Record<string, unknown>> {
  return findings.map((finding) => ({
    id: finding.id,
    control_id: finding.controlId,
    title: finding.title,
    summary: finding.summary,
    finding_state: finding.findingState,
    source: finding.source,
    lesson_title: finding.lessonTitle,
    oscal_finding_id: finding.oscalFindingId ?? null,
  }));
}

export function buildPoamSourceGapsMessage(
  gaps: PoamSourceFindingGap[]
): string {
  if (gaps.length === 0) {
    return 'Complete the prerequisite lessons before drafting POA&M entries.';
  }
  return gaps.map((gap) => gap.message).join(' ');
}
