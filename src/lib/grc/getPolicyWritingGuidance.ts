import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  formatRetrievedGuidance,
  retrieveFromGuidanceDocument,
  type GuidanceDocument,
  type RetrievedGuidance,
} from '@/lib/grading/retrieveGuidance';

/**
 * F26-style retrieval for pinned policy-writing rubric guidance.
 * Graders must use retrieved section text only.
 */

export const POLICY_WRITING_GUIDANCE_PATH =
  'data/grc/policy-writing-rubric.json';

export type PolicyWritingGuidanceSection = GuidanceDocument['sections'][number];
export type PolicyWritingGuidanceDocument = GuidanceDocument;
export type RetrievedPolicyWritingGuidance = RetrievedGuidance;

let cachedDocument: GuidanceDocument | null = null;

function loadGuidanceDocument(): GuidanceDocument {
  if (cachedDocument) {
    return cachedDocument;
  }

  const filePath = path.join(process.cwd(), POLICY_WRITING_GUIDANCE_PATH);
  const raw = readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw) as GuidanceDocument;

  if (!parsed?.sections || !Array.isArray(parsed.sections)) {
    throw new Error(
      `Invalid policy writing guidance file: ${POLICY_WRITING_GUIDANCE_PATH}`
    );
  }

  cachedDocument = parsed;
  return cachedDocument;
}

/** Reset cached document (tests only). */
export function resetPolicyWritingGuidanceCacheForTests(): void {
  cachedDocument = null;
}

const DEFAULT_CORE_SECTION_IDS = [
  'clear-scope',
  'enforceable-language',
  'exceptions-process',
  'draft-completeness',
] as const;

/**
 * Retrieve pinned policy-writing rubric sections for grading a student draft.
 * Always includes scope / enforceable language / exceptions / completeness,
 * then tops up with keyword-ranked sections from the query.
 */
export function retrievePolicyWritingGuidance(
  query: string,
  options?: {
    topK?: number;
    requiredSectionIds?: string[];
  }
): RetrievedPolicyWritingGuidance {
  const doc = loadGuidanceDocument();
  return retrieveFromGuidanceDocument(
    doc,
    POLICY_WRITING_GUIDANCE_PATH,
    query,
    {
      topK: options?.topK ?? 5,
      requiredSectionIds: options?.requiredSectionIds ?? [
        ...DEFAULT_CORE_SECTION_IDS,
      ],
    }
  );
}

export function formatRetrievedPolicyWritingGuidance(
  retrieved: RetrievedPolicyWritingGuidance
): string {
  return formatRetrievedGuidance(retrieved);
}

export function listPolicyWritingGuidanceSections(): PolicyWritingGuidanceSection[] {
  return loadGuidanceDocument().sections.map((section) => ({ ...section }));
}
