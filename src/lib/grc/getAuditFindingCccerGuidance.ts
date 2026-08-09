import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  formatRetrievedGuidance,
  retrieveFromGuidanceDocument,
  type GuidanceDocument,
  type RetrievedGuidance,
} from '@/lib/grading/retrieveGuidance';

/**
 * F26-style retrieval for pinned IIA/GAO CCCER audit-finding writing guidance.
 * Graders must use retrieved section text (+ ticket exception context) only.
 */

export const AUDIT_FINDING_CCCER_GUIDANCE_PATH =
  'data/grc/audit-finding-cccer-guidance.json';

export type AuditFindingCccerGuidanceSection =
  GuidanceDocument['sections'][number];
export type AuditFindingCccerGuidanceDocument = GuidanceDocument;
export type RetrievedAuditFindingCccerGuidance = RetrievedGuidance;

let cachedDocument: GuidanceDocument | null = null;

function loadGuidanceDocument(): GuidanceDocument {
  if (cachedDocument) {
    return cachedDocument;
  }

  const filePath = path.join(process.cwd(), AUDIT_FINDING_CCCER_GUIDANCE_PATH);
  const raw = readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw) as GuidanceDocument;

  if (!parsed?.sections || !Array.isArray(parsed.sections)) {
    throw new Error(
      `Invalid audit-finding CCCER guidance file: ${AUDIT_FINDING_CCCER_GUIDANCE_PATH}`
    );
  }

  cachedDocument = parsed;
  return cachedDocument;
}

/** Reset cached document (tests only). */
export function resetAuditFindingCccerGuidanceCacheForTests(): void {
  cachedDocument = null;
}

const DEFAULT_CORE_SECTION_IDS = [
  'finding-elements-overview',
  'condition',
  'criteria',
  'cause',
  'effect',
  'recommendation',
] as const;

/**
 * Retrieve pinned CCCER finding-writing guidance for grading a student submission.
 * Always includes core element sections, then tops up with keyword-ranked matches.
 */
export function retrieveAuditFindingCccerGuidance(
  query: string,
  options?: {
    topK?: number;
    requiredSectionIds?: string[];
  }
): RetrievedAuditFindingCccerGuidance {
  const doc = loadGuidanceDocument();
  return retrieveFromGuidanceDocument(
    doc,
    AUDIT_FINDING_CCCER_GUIDANCE_PATH,
    query,
    {
      topK: options?.topK ?? 8,
      requiredSectionIds: options?.requiredSectionIds ?? [
        ...DEFAULT_CORE_SECTION_IDS,
      ],
    }
  );
}

export function formatRetrievedAuditFindingCccerGuidance(
  retrieved: RetrievedAuditFindingCccerGuidance
): string {
  return formatRetrievedGuidance(retrieved);
}

export function listAuditFindingCccerGuidanceSections(): AuditFindingCccerGuidanceSection[] {
  return loadGuidanceDocument().sections.map((section) => ({ ...section }));
}
