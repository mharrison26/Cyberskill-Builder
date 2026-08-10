import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  formatRetrievedGuidance,
  retrieveFromGuidanceDocument,
  type GuidanceDocument,
  type RetrievedGuidance,
} from '@/lib/grading/retrieveGuidance';

/**
 * F26-style retrieval for pinned security budget risk-allocation rubric.
 * Graders must use retrieved section text only.
 */

export const SECURITY_BUDGET_GUIDANCE_PATH =
  'data/grc/security-budget-risk-rubric.json';

export type SecurityBudgetGuidanceSection =
  GuidanceDocument['sections'][number];
export type SecurityBudgetGuidanceDocument = GuidanceDocument;
export type RetrievedSecurityBudgetGuidance = RetrievedGuidance;

let cachedDocument: GuidanceDocument | null = null;

function loadGuidanceDocument(): GuidanceDocument {
  if (cachedDocument) {
    return cachedDocument;
  }

  const filePath = path.join(process.cwd(), SECURITY_BUDGET_GUIDANCE_PATH);
  const raw = readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw) as GuidanceDocument;

  if (!parsed?.sections || !Array.isArray(parsed.sections)) {
    throw new Error(
      `Invalid security budget guidance file: ${SECURITY_BUDGET_GUIDANCE_PATH}`
    );
  }

  cachedDocument = parsed;
  return cachedDocument;
}

/** Reset cached document (tests only). */
export function resetSecurityBudgetGuidanceCacheForTests(): void {
  cachedDocument = null;
}

const DEFAULT_CORE_SECTION_IDS = [
  'risk-based-budgeting',
  'justify-with-risk-linkage',
  'avoid-vanity-spend',
  'justify-cuts-and-zeros',
] as const;

/**
 * Retrieve pinned security-budget rubric sections for grading an allocation.
 * Always includes risk-based budgeting / justification / vanity / cuts,
 * then tops up with keyword-ranked sections from the query.
 */
export function retrieveSecurityBudgetGuidance(
  query: string,
  options?: {
    topK?: number;
    requiredSectionIds?: string[];
  }
): RetrievedSecurityBudgetGuidance {
  const doc = loadGuidanceDocument();
  return retrieveFromGuidanceDocument(
    doc,
    SECURITY_BUDGET_GUIDANCE_PATH,
    query,
    {
      topK: options?.topK ?? 5,
      requiredSectionIds: options?.requiredSectionIds ?? [
        ...DEFAULT_CORE_SECTION_IDS,
      ],
    }
  );
}

export function formatRetrievedSecurityBudgetGuidance(
  retrieved: RetrievedSecurityBudgetGuidance
): string {
  return formatRetrievedGuidance(retrieved);
}

export function listSecurityBudgetGuidanceSections(): SecurityBudgetGuidanceSection[] {
  return loadGuidanceDocument().sections.map((section) => ({ ...section }));
}
