import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  formatRetrievedGuidance,
  retrieveFromGuidanceDocument,
  type GuidanceDocument,
  type RetrievedGuidance,
} from '@/lib/grading/retrieveGuidance';

/**
 * F26-style retrieval for pinned risk-based annual audit planning guidance.
 * Graders must use retrieved section text (+ ticket risk register) only.
 */

export const RISK_BASED_AUDIT_PLAN_GUIDANCE_PATH =
  'data/grc/risk-based-audit-planning-guidance.json';

export type RiskBasedAuditPlanGuidanceSection =
  GuidanceDocument['sections'][number];
export type RiskBasedAuditPlanGuidanceDocument = GuidanceDocument;
export type RetrievedRiskBasedAuditPlanGuidance = RetrievedGuidance;

let cachedDocument: GuidanceDocument | null = null;

function loadGuidanceDocument(): GuidanceDocument {
  if (cachedDocument) {
    return cachedDocument;
  }

  const filePath = path.join(
    process.cwd(),
    RISK_BASED_AUDIT_PLAN_GUIDANCE_PATH
  );
  const raw = readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw) as GuidanceDocument;

  if (!parsed?.sections || !Array.isArray(parsed.sections)) {
    throw new Error(
      `Invalid risk-based audit plan guidance file: ${RISK_BASED_AUDIT_PLAN_GUIDANCE_PATH}`
    );
  }

  cachedDocument = parsed;
  return cachedDocument;
}

/** Reset cached document (tests only). */
export function resetRiskBasedAuditPlanGuidanceCacheForTests(): void {
  cachedDocument = null;
}

const DEFAULT_CORE_SECTION_IDS = [
  'risk-based-priority',
  'justification-quality',
  'capacity-tradeoffs',
  'avoid-low-risk-bias',
] as const;

/**
 * Retrieve pinned risk-based planning guidance for grading a student plan.
 * Always includes core priority / justification / capacity / low-risk sections,
 * then tops up with keyword-ranked sections from the query.
 */
export function retrieveRiskBasedAuditPlanGuidance(
  query: string,
  options?: {
    topK?: number;
    requiredSectionIds?: string[];
  }
): RetrievedRiskBasedAuditPlanGuidance {
  const doc = loadGuidanceDocument();
  return retrieveFromGuidanceDocument(
    doc,
    RISK_BASED_AUDIT_PLAN_GUIDANCE_PATH,
    query,
    {
      topK: options?.topK ?? 5,
      requiredSectionIds: options?.requiredSectionIds ?? [
        ...DEFAULT_CORE_SECTION_IDS,
      ],
    }
  );
}

export function formatRetrievedRiskBasedAuditPlanGuidance(
  retrieved: RetrievedRiskBasedAuditPlanGuidance
): string {
  return formatRetrievedGuidance(retrieved);
}

export function listRiskBasedAuditPlanGuidanceSections(): RiskBasedAuditPlanGuidanceSection[] {
  return loadGuidanceDocument().sections.map((section) => ({ ...section }));
}
