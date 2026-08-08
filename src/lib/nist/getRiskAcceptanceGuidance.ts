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
 * F26-style retrieval for pinned AO risk-acceptance guidance.
 */

export const RISK_ACCEPTANCE_GUIDANCE_PATH =
  'data/nist/risk-acceptance-guidance.json';

export type RiskAcceptanceGuidanceSection = GuidanceSection;
export type RetrievedRiskAcceptanceGuidance = RetrievedGuidance;

let cachedDocument: GuidanceDocument | null = null;

function loadGuidanceDocument(): GuidanceDocument {
  if (cachedDocument) {
    return cachedDocument;
  }

  const filePath = path.join(process.cwd(), RISK_ACCEPTANCE_GUIDANCE_PATH);
  const raw = readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw) as GuidanceDocument;

  if (!parsed?.sections || !Array.isArray(parsed.sections)) {
    throw new Error(
      `Invalid risk-acceptance guidance file: ${RISK_ACCEPTANCE_GUIDANCE_PATH}`
    );
  }

  cachedDocument = parsed;
  return cachedDocument;
}

/** Reset cached document (tests only). */
export function resetRiskAcceptanceGuidanceCacheForTests(): void {
  cachedDocument = null;
}

const DEFAULT_CORE_SECTION_IDS = [
  'ao-role',
  'risk-acceptance-criteria',
  'poam-and-acceptance',
] as const;

export function retrieveRiskAcceptanceGuidance(
  query: string,
  options?: {
    topK?: number;
    requiredSectionIds?: string[];
  }
): RetrievedRiskAcceptanceGuidance {
  const doc = loadGuidanceDocument();
  return retrieveFromGuidanceDocument(
    doc,
    RISK_ACCEPTANCE_GUIDANCE_PATH,
    query,
    {
      topK: options?.topK ?? 5,
      requiredSectionIds: options?.requiredSectionIds ?? [
        ...DEFAULT_CORE_SECTION_IDS,
      ],
    }
  );
}

export function formatRetrievedRiskAcceptanceGuidance(
  retrieved: RetrievedRiskAcceptanceGuidance
): string {
  return formatRetrievedGuidance(retrieved);
}
