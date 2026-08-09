import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  formatRetrievedGuidance,
  retrieveFromGuidanceDocument,
  type GuidanceDocument,
  type RetrievedGuidance,
} from '@/lib/grading/retrieveGuidance';

/**
 * F26-style retrieval for pinned continuous auditing design guidance.
 * Graders must use retrieved section text only.
 */

export const CONTINUOUS_AUDITING_GUIDANCE_PATH =
  'data/grc/continuous-auditing-guidance.json';

export type ContinuousAuditingGuidanceSection =
  GuidanceDocument['sections'][number];
export type ContinuousAuditingGuidanceDocument = GuidanceDocument;
export type RetrievedContinuousAuditingGuidance = RetrievedGuidance;

let cachedDocument: GuidanceDocument | null = null;

function loadGuidanceDocument(): GuidanceDocument {
  if (cachedDocument) {
    return cachedDocument;
  }

  const filePath = path.join(process.cwd(), CONTINUOUS_AUDITING_GUIDANCE_PATH);
  const raw = readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw) as GuidanceDocument;

  if (!parsed?.sections || !Array.isArray(parsed.sections)) {
    throw new Error(
      `Invalid continuous auditing guidance file: ${CONTINUOUS_AUDITING_GUIDANCE_PATH}`
    );
  }

  cachedDocument = parsed;
  return cachedDocument;
}

/** Reset cached document (tests only). */
export function resetContinuousAuditingGuidanceCacheForTests(): void {
  cachedDocument = null;
}

const DEFAULT_CORE_SECTION_IDS = [
  'frequency-design',
  'data-source-design',
  'exception-handling',
  'design-completeness',
] as const;

/**
 * Retrieve pinned continuous auditing guidance for grading a student design.
 * Always includes frequency / data source / exception / completeness sections,
 * then tops up with keyword-ranked sections from the query.
 */
export function retrieveContinuousAuditingGuidance(
  query: string,
  options?: {
    topK?: number;
    requiredSectionIds?: string[];
  }
): RetrievedContinuousAuditingGuidance {
  const doc = loadGuidanceDocument();
  return retrieveFromGuidanceDocument(
    doc,
    CONTINUOUS_AUDITING_GUIDANCE_PATH,
    query,
    {
      topK: options?.topK ?? 5,
      requiredSectionIds: options?.requiredSectionIds ?? [
        ...DEFAULT_CORE_SECTION_IDS,
      ],
    }
  );
}

export function formatRetrievedContinuousAuditingGuidance(
  retrieved: RetrievedContinuousAuditingGuidance
): string {
  return formatRetrievedGuidance(retrieved);
}

export function listContinuousAuditingGuidanceSections(): ContinuousAuditingGuidanceSection[] {
  return loadGuidanceDocument().sections.map((section) => ({ ...section }));
}
