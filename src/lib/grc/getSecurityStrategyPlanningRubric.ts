import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  formatRetrievedGuidance,
  retrieveFromGuidanceDocument,
  type GuidanceDocument,
  type RetrievedGuidance,
} from '@/lib/grading/retrieveGuidance';

/**
 * F26-style retrieval for pinned one-year security strategy planning rubric.
 * Graders must use retrieved section text only.
 */

export const SECURITY_STRATEGY_PLANNING_RUBRIC_PATH =
  'data/grc/security-strategy-planning-rubric.json';

export type SecurityStrategyPlanningRubricSection =
  GuidanceDocument['sections'][number];
export type SecurityStrategyPlanningRubricDocument = GuidanceDocument;
export type RetrievedSecurityStrategyPlanningRubric = RetrievedGuidance;

let cachedDocument: GuidanceDocument | null = null;

function loadGuidanceDocument(): GuidanceDocument {
  if (cachedDocument) {
    return cachedDocument;
  }

  const filePath = path.join(
    process.cwd(),
    SECURITY_STRATEGY_PLANNING_RUBRIC_PATH
  );
  const raw = readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw) as GuidanceDocument;

  if (!parsed?.sections || !Array.isArray(parsed.sections)) {
    throw new Error(
      `Invalid security strategy planning rubric file: ${SECURITY_STRATEGY_PLANNING_RUBRIC_PATH}`
    );
  }

  cachedDocument = parsed;
  return cachedDocument;
}

/** Reset cached document (tests only). */
export function resetSecurityStrategyPlanningRubricCacheForTests(): void {
  cachedDocument = null;
}

const DEFAULT_CORE_SECTION_IDS = [
  'risk-aligned-priorities',
  'budget-realistic-resourcing',
  'measurable-outcomes',
  'ties-to-prior-findings',
  'avoid-generic-platitudes',
] as const;

/**
 * Retrieve pinned strategic-planning rubric sections for grading a strategy memo.
 * Always includes core priority / resourcing / outcomes / findings / platitude
 * sections, then tops up with keyword-ranked sections from the query.
 */
export function retrieveSecurityStrategyPlanningRubric(
  query: string,
  options?: {
    topK?: number;
    requiredSectionIds?: string[];
  }
): RetrievedSecurityStrategyPlanningRubric {
  const doc = loadGuidanceDocument();
  return retrieveFromGuidanceDocument(
    doc,
    SECURITY_STRATEGY_PLANNING_RUBRIC_PATH,
    query,
    {
      topK: options?.topK ?? 6,
      requiredSectionIds: options?.requiredSectionIds ?? [
        ...DEFAULT_CORE_SECTION_IDS,
      ],
    }
  );
}

export function formatRetrievedSecurityStrategyPlanningRubric(
  retrieved: RetrievedSecurityStrategyPlanningRubric
): string {
  return formatRetrievedGuidance(retrieved);
}

export function listSecurityStrategyPlanningRubricSections(): SecurityStrategyPlanningRubricSection[] {
  return loadGuidanceDocument().sections.map((section) => ({ ...section }));
}
