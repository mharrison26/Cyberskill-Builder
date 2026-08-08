import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  formatRetrievedGuidance,
  retrieveFromGuidanceDocument,
  type GuidanceDocument,
  type RetrievedGuidance,
} from '@/lib/grading/retrieveGuidance';

/**
 * F26-style retrieval for the KB article writing-quality rubric.
 * Graders must use retrieved rubric section text only — not a compliance framework.
 */

export const KB_QUALITY_RUBRIC_PATH = 'data/kb/kb-article-quality-rubric.json';

export type KbQualityRubricSection = GuidanceDocument['sections'][number];
export type KbQualityRubricDocument = GuidanceDocument;
export type RetrievedKbQualityRubric = RetrievedGuidance;

let cachedDocument: GuidanceDocument | null = null;

function loadRubricDocument(): GuidanceDocument {
  if (cachedDocument) {
    return cachedDocument;
  }

  const filePath = path.join(process.cwd(), KB_QUALITY_RUBRIC_PATH);
  const raw = readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw) as GuidanceDocument;

  if (!parsed?.sections || !Array.isArray(parsed.sections)) {
    throw new Error(`Invalid KB quality rubric file: ${KB_QUALITY_RUBRIC_PATH}`);
  }

  cachedDocument = parsed;
  return cachedDocument;
}

/** Reset cached document (tests only). */
export function resetKbQualityRubricCacheForTests(): void {
  cachedDocument = null;
}

const DEFAULT_CORE_SECTION_IDS = [
  'clarity',
  'completeness',
  'jargon',
] as const;

/**
 * Retrieve pinned KB-quality rubric sections for a student write-up.
 * Always includes clarity / completeness / jargon, then tops up with
 * keyword-ranked sections from the query (RAG-style grounding).
 */
export function retrieveKbQualityRubric(
  query: string,
  options?: {
    topK?: number;
    requiredSectionIds?: string[];
  }
): RetrievedKbQualityRubric {
  const doc = loadRubricDocument();
  return retrieveFromGuidanceDocument(doc, KB_QUALITY_RUBRIC_PATH, query, {
    topK: options?.topK ?? 5,
    requiredSectionIds:
      options?.requiredSectionIds ?? [...DEFAULT_CORE_SECTION_IDS],
  });
}

export function formatRetrievedKbQualityRubric(
  retrieved: RetrievedKbQualityRubric
): string {
  return formatRetrievedGuidance(retrieved);
}

export function listKbQualityRubricSections(): KbQualityRubricSection[] {
  return loadRubricDocument().sections.map((section) => ({ ...section }));
}
