import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  formatRetrievedGuidance,
  retrieveFromGuidanceDocument,
  type GuidanceDocument,
  type RetrievedGuidance,
} from '@/lib/grading/retrieveGuidance';

/**
 * F26-style retrieval for the pinned architecture-decision / tradeoff rubric.
 * Question generation and grading must use retrieved rubric text only
 * (plus the student's design doc excerpts).
 */

export const ARCHITECTURE_DECISION_RUBRIC_PATH =
  'data/infra/architecture-decision-tradeoff-rubric.json';

export type ArchitectureDecisionRubricSection =
  GuidanceDocument['sections'][number];
export type ArchitectureDecisionRubricDocument = GuidanceDocument;
export type RetrievedArchitectureDecisionRubric = RetrievedGuidance;

let cachedDocument: GuidanceDocument | null = null;

function loadRubricDocument(): GuidanceDocument {
  if (cachedDocument) {
    return cachedDocument;
  }

  const filePath = path.join(process.cwd(), ARCHITECTURE_DECISION_RUBRIC_PATH);
  const raw = readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw) as GuidanceDocument;

  if (!parsed?.sections || !Array.isArray(parsed.sections)) {
    throw new Error(
      `Invalid architecture-decision rubric file: ${ARCHITECTURE_DECISION_RUBRIC_PATH}`
    );
  }

  cachedDocument = parsed;
  return cachedDocument;
}

/** Reset cached document (tests only). */
export function resetArchitectureDecisionRubricCacheForTests(): void {
  cachedDocument = null;
}

const DEFAULT_CORE_SECTION_IDS = [
  'decision-clarity',
  'constraints-fit',
  'tradeoffs-explicit',
  'failure-modes',
  'operability',
] as const;

/**
 * Retrieve pinned ADR / tradeoff rubric sections for a student design doc
 * or follow-up answers. Always includes core decision / constraints /
 * tradeoff / failure / operability sections, then tops up by keyword rank.
 */
export function retrieveArchitectureDecisionRubric(
  query: string,
  options?: {
    topK?: number;
    requiredSectionIds?: string[];
  }
): RetrievedArchitectureDecisionRubric {
  const doc = loadRubricDocument();
  return retrieveFromGuidanceDocument(
    doc,
    ARCHITECTURE_DECISION_RUBRIC_PATH,
    query,
    {
      topK: options?.topK ?? 6,
      requiredSectionIds: options?.requiredSectionIds ?? [
        ...DEFAULT_CORE_SECTION_IDS,
      ],
    }
  );
}

export function formatRetrievedArchitectureDecisionRubric(
  retrieved: RetrievedArchitectureDecisionRubric
): string {
  return formatRetrievedGuidance(retrieved);
}

export function listArchitectureDecisionRubricSections(): ArchitectureDecisionRubricSection[] {
  return loadRubricDocument().sections.map((section) => ({ ...section }));
}
