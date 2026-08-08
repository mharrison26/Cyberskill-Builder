import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  formatRetrievedGuidance,
  retrieveFromGuidanceDocument,
  type GuidanceDocument,
  type GuidanceSection,
  type RetrievedGuidance,
} from '@/lib/grading/retrieveGuidance';

/**
 * F26-style retrieval for the pinned coaching-quality rubric.
 * Graders must use retrieved section text only — not model memory of management practice.
 */

export const COACHING_QUALITY_RUBRIC_PATH =
  'data/helpdesk/coaching-quality-rubric.json';

export type CoachingQualityRubricSection = GuidanceSection;
export type RetrievedCoachingQualityRubric = RetrievedGuidance & {
  disclaimer: string | null;
};

let cachedDocument: (GuidanceDocument & { disclaimer?: string }) | null = null;

function loadRubricDocument(): GuidanceDocument & { disclaimer?: string } {
  if (cachedDocument) {
    return cachedDocument;
  }

  const filePath = path.join(process.cwd(), COACHING_QUALITY_RUBRIC_PATH);
  const raw = readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw) as GuidanceDocument & { disclaimer?: string };

  if (!parsed?.sections || !Array.isArray(parsed.sections)) {
    throw new Error(
      `Invalid coaching quality rubric file: ${COACHING_QUALITY_RUBRIC_PATH}`
    );
  }

  cachedDocument = parsed;
  return cachedDocument;
}

/** Reset cached document (tests only). */
export function resetCoachingQualityRubricCacheForTests(): void {
  cachedDocument = null;
}

export function getCoachingQualityRubricSection(
  sectionId: string
): CoachingQualityRubricSection {
  const doc = loadRubricDocument();
  const key = sectionId.trim().toLowerCase();
  const section = doc.sections.find((entry) => entry.id.toLowerCase() === key);

  if (!section) {
    throw new Error(`Coaching quality rubric section not found: ${sectionId}`);
  }

  return section;
}

export function listCoachingQualityRubricSections(): CoachingQualityRubricSection[] {
  return loadRubricDocument().sections.map((section) => ({ ...section }));
}

/** Core criteria — always pinned for anti-hallucination grading. */
export const DEFAULT_COACHING_FEEDBACK_RUBRIC_SECTION_IDS = [
  'specific',
  'actionable',
  'respectful',
] as const;

/**
 * Retrieve pinned coaching-quality rubric sections for student feedback.
 * Defaults to requiring specific / actionable / respectful so the core rubric is pinned.
 */
export function retrieveCoachingQualityRubric(
  query: string,
  options?: {
    topK?: number;
    requiredSectionIds?: string[];
  }
): RetrievedCoachingQualityRubric {
  const doc = loadRubricDocument();
  const retrieved = retrieveFromGuidanceDocument(
    doc,
    COACHING_QUALITY_RUBRIC_PATH,
    query,
    {
      topK: options?.topK ?? 5,
      requiredSectionIds: options?.requiredSectionIds ?? [
        ...DEFAULT_COACHING_FEEDBACK_RUBRIC_SECTION_IDS,
      ],
    }
  );

  return {
    ...retrieved,
    disclaimer:
      typeof doc.disclaimer === 'string' && doc.disclaimer.trim()
        ? doc.disclaimer.trim()
        : null,
  };
}

export function formatRetrievedCoachingQualityRubric(
  retrieved: RetrievedCoachingQualityRubric
): string {
  return formatRetrievedGuidance(retrieved);
}
