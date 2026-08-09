import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  formatRetrievedGuidance,
  retrieveFromGuidanceDocument,
  type GuidanceDocument,
  type RetrievedGuidance,
} from '@/lib/grading/retrieveGuidance';

/**
 * F26-style retrieval for pinned audit-committee / executive reporting guidance.
 * Graders and question generators must use retrieved section text only.
 */

export const AUDIT_COMMITTEE_GUIDANCE_PATH =
  'data/grc/audit-committee-reporting-guidance.json';

export type AuditCommitteeGuidanceSection = GuidanceDocument['sections'][number];
export type AuditCommitteeGuidanceDocument = GuidanceDocument;
export type RetrievedAuditCommitteeGuidance = RetrievedGuidance;

let cachedDocument: GuidanceDocument | null = null;

function loadGuidanceDocument(): GuidanceDocument {
  if (cachedDocument) {
    return cachedDocument;
  }

  const filePath = path.join(process.cwd(), AUDIT_COMMITTEE_GUIDANCE_PATH);
  const raw = readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw) as GuidanceDocument;

  if (!parsed?.sections || !Array.isArray(parsed.sections)) {
    throw new Error(
      `Invalid audit committee guidance file: ${AUDIT_COMMITTEE_GUIDANCE_PATH}`
    );
  }

  cachedDocument = parsed;
  return cachedDocument;
}

/** Reset cached document (tests only). */
export function resetAuditCommitteeGuidanceCacheForTests(): void {
  cachedDocument = null;
}

const DEFAULT_CORE_SECTION_IDS = [
  'exec-summary-purpose',
  'ac-question-quality',
  'residual-risk',
] as const;

/**
 * Retrieve pinned AC / executive reporting guidance for question gen or grading.
 */
export function retrieveAuditCommitteeGuidance(
  query: string,
  options?: {
    topK?: number;
    requiredSectionIds?: string[];
  }
): RetrievedAuditCommitteeGuidance {
  const doc = loadGuidanceDocument();
  return retrieveFromGuidanceDocument(doc, AUDIT_COMMITTEE_GUIDANCE_PATH, query, {
    topK: options?.topK ?? 5,
    requiredSectionIds: options?.requiredSectionIds ?? [
      ...DEFAULT_CORE_SECTION_IDS,
    ],
  });
}

export function formatRetrievedAuditCommitteeGuidance(
  retrieved: RetrievedAuditCommitteeGuidance
): string {
  return formatRetrievedGuidance(retrieved);
}

export function listAuditCommitteeGuidanceSections(): AuditCommitteeGuidanceSection[] {
  return loadGuidanceDocument().sections.map((section) => ({ ...section }));
}
