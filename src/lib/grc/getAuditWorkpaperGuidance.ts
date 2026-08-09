import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  formatRetrievedGuidance,
  retrieveFromGuidanceDocument,
  type GuidanceDocument,
  type RetrievedGuidance,
} from '@/lib/grading/retrieveGuidance';

/**
 * F26-style retrieval for pinned audit workpaper quality guidance.
 * Graders must use retrieved section text (+ ticket stated test objective) only.
 */

export const AUDIT_WORKPAPER_GUIDANCE_PATH =
  'data/grc/audit-workpaper-guidance.json';

export type AuditWorkpaperGuidanceSection =
  GuidanceDocument['sections'][number];
export type AuditWorkpaperGuidanceDocument = GuidanceDocument;
export type RetrievedAuditWorkpaperGuidance = RetrievedGuidance;

let cachedDocument: GuidanceDocument | null = null;

function loadGuidanceDocument(): GuidanceDocument {
  if (cachedDocument) {
    return cachedDocument;
  }

  const filePath = path.join(process.cwd(), AUDIT_WORKPAPER_GUIDANCE_PATH);
  const raw = readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw) as GuidanceDocument;

  if (!parsed?.sections || !Array.isArray(parsed.sections)) {
    throw new Error(
      `Invalid audit workpaper guidance file: ${AUDIT_WORKPAPER_GUIDANCE_PATH}`
    );
  }

  cachedDocument = parsed;
  return cachedDocument;
}

/** Reset cached document (tests only). */
export function resetAuditWorkpaperGuidanceCacheForTests(): void {
  cachedDocument = null;
}

const DEFAULT_CORE_SECTION_IDS = [
  'stated-objective',
  'conclusion-quality',
  'objective-alignment',
] as const;

/**
 * Retrieve pinned workpaper guidance for grading a student submission.
 * Always includes objective / conclusion / alignment sections, then tops up
 * with keyword-ranked sections from the query.
 */
export function retrieveAuditWorkpaperGuidance(
  query: string,
  options?: {
    topK?: number;
    requiredSectionIds?: string[];
  }
): RetrievedAuditWorkpaperGuidance {
  const doc = loadGuidanceDocument();
  return retrieveFromGuidanceDocument(
    doc,
    AUDIT_WORKPAPER_GUIDANCE_PATH,
    query,
    {
      topK: options?.topK ?? 5,
      requiredSectionIds: options?.requiredSectionIds ?? [
        ...DEFAULT_CORE_SECTION_IDS,
      ],
    }
  );
}

export function formatRetrievedAuditWorkpaperGuidance(
  retrieved: RetrievedAuditWorkpaperGuidance
): string {
  return formatRetrievedGuidance(retrieved);
}

export function listAuditWorkpaperGuidanceSections(): AuditWorkpaperGuidanceSection[] {
  return loadGuidanceDocument().sections.map((section) => ({ ...section }));
}
