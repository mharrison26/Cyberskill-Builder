import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  formatRetrievedGuidance,
  retrieveFromGuidanceDocument,
  type GuidanceDocument,
  type RetrievedGuidance,
} from '@/lib/grading/retrieveGuidance';

/**
 * F26-style retrieval for pinned program-metrics best-practices rubric.
 * Graders must use retrieved section text only.
 */

export const PROGRAM_METRICS_RUBRIC_PATH =
  'data/grc/program-metrics-rubric.json';

export type ProgramMetricsRubricSection = GuidanceDocument['sections'][number];
export type ProgramMetricsRubricDocument = GuidanceDocument;
export type RetrievedProgramMetricsRubric = RetrievedGuidance;

let cachedDocument: GuidanceDocument | null = null;

function loadRubricDocument(): GuidanceDocument {
  if (cachedDocument) {
    return cachedDocument;
  }

  const filePath = path.join(process.cwd(), PROGRAM_METRICS_RUBRIC_PATH);
  const raw = readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw) as GuidanceDocument;

  if (!parsed?.sections || !Array.isArray(parsed.sections)) {
    throw new Error(
      `Invalid program metrics rubric file: ${PROGRAM_METRICS_RUBRIC_PATH}`
    );
  }

  cachedDocument = parsed;
  return cachedDocument;
}

/** Reset cached document (tests only). */
export function resetProgramMetricsRubricCacheForTests(): void {
  cachedDocument = null;
}

const DEFAULT_CORE_SECTION_IDS = [
  'leadership-metric-purpose',
  'poam-aging-and-overdue',
  'training-completion',
  'incident-severity-context',
  'avoid-vanity-metrics',
  'rationale-quality',
] as const;

/**
 * Retrieve pinned program-metrics rubric sections for grading metric selection
 * and leadership rationale. Always pins core leadership / POA&M / training /
 * incident / vanity / rationale sections, then tops up from the query.
 */
export function retrieveProgramMetricsRubric(
  query: string,
  options?: {
    topK?: number;
    requiredSectionIds?: string[];
  }
): RetrievedProgramMetricsRubric {
  const doc = loadRubricDocument();
  return retrieveFromGuidanceDocument(doc, PROGRAM_METRICS_RUBRIC_PATH, query, {
    topK: options?.topK ?? 6,
    requiredSectionIds: options?.requiredSectionIds ?? [
      ...DEFAULT_CORE_SECTION_IDS,
    ],
  });
}

export function formatRetrievedProgramMetricsRubric(
  retrieved: RetrievedProgramMetricsRubric
): string {
  return formatRetrievedGuidance(retrieved);
}

export function listProgramMetricsRubricSections(): ProgramMetricsRubricSection[] {
  return loadRubricDocument().sections.map((section) => ({ ...section }));
}
