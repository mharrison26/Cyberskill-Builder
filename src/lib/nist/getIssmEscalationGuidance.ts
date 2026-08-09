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
 * F26-style retrieval for pinned ISSO→ISSM escalation-criteria guidance.
 */

export const ISSM_ESCALATION_GUIDANCE_PATH =
  'data/nist/issm-escalation-guidance.json';

export type IssmEscalationGuidanceSection = GuidanceSection;
export type RetrievedIssmEscalationGuidance = RetrievedGuidance;

let cachedDocument: GuidanceDocument | null = null;

function loadGuidanceDocument(): GuidanceDocument {
  if (cachedDocument) {
    return cachedDocument;
  }

  const filePath = path.join(process.cwd(), ISSM_ESCALATION_GUIDANCE_PATH);
  const raw = readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw) as GuidanceDocument;

  if (!parsed?.sections || !Array.isArray(parsed.sections)) {
    throw new Error(
      `Invalid ISSM escalation guidance file: ${ISSM_ESCALATION_GUIDANCE_PATH}`
    );
  }

  cachedDocument = parsed;
  return cachedDocument;
}

/** Reset cached document (tests only). */
export function resetIssmEscalationGuidanceCacheForTests(): void {
  cachedDocument = null;
}

const DEFAULT_CORE_SECTION_IDS = [
  'cross-system-impact',
  'resource-authority',
  'escalation-criteria',
] as const;

export function retrieveIssmEscalationGuidance(
  query: string,
  options?: {
    topK?: number;
    requiredSectionIds?: string[];
  }
): RetrievedIssmEscalationGuidance {
  const doc = loadGuidanceDocument();
  return retrieveFromGuidanceDocument(
    doc,
    ISSM_ESCALATION_GUIDANCE_PATH,
    query,
    {
      topK: options?.topK ?? 5,
      requiredSectionIds: options?.requiredSectionIds ?? [
        ...DEFAULT_CORE_SECTION_IDS,
      ],
    }
  );
}

export function formatRetrievedIssmEscalationGuidance(
  retrieved: RetrievedIssmEscalationGuidance
): string {
  return formatRetrievedGuidance(retrieved);
}
