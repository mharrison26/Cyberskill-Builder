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
 * F26-style retrieval for the pinned subnetting / TCP-IP diagnostics rubric.
 * Graders must use retrieved section text only — not model memory of networking.
 */

export const SUBNETTING_TCPIP_RUBRIC_PATH =
  'data/networking/subnetting-tcpip-rubric.json';

export type SubnettingTcpIpRubricSection = GuidanceSection;
export type RetrievedSubnettingTcpIpRubric = RetrievedGuidance & {
  disclaimer: string | null;
};

let cachedDocument: (GuidanceDocument & { disclaimer?: string }) | null = null;

function loadRubricDocument(): GuidanceDocument & { disclaimer?: string } {
  if (cachedDocument) {
    return cachedDocument;
  }

  const filePath = path.join(process.cwd(), SUBNETTING_TCPIP_RUBRIC_PATH);
  const raw = readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw) as GuidanceDocument & { disclaimer?: string };

  if (!parsed?.sections || !Array.isArray(parsed.sections)) {
    throw new Error(
      `Invalid subnetting/TCP-IP rubric file: ${SUBNETTING_TCPIP_RUBRIC_PATH}`
    );
  }

  cachedDocument = parsed;
  return cachedDocument;
}

/** Reset cached document (tests only). */
export function resetSubnettingTcpIpRubricCacheForTests(): void {
  cachedDocument = null;
}

/** Core criteria — always pinned for anti-hallucination grading. */
export const DEFAULT_NETWORK_TOPOLOGY_FAULT_RUBRIC_SECTION_IDS = [
  'gateway-same-subnet',
  'subnet-mask-boundaries',
  'evidence-from-diagnostics',
  'isolate-fault-location',
] as const;

/**
 * Retrieve pinned subnetting/TCP-IP rubric sections for a student justification.
 * Defaults to requiring all four criteria so the full rubric is pinned.
 */
export function retrieveSubnettingTcpIpRubric(
  query: string,
  options?: {
    topK?: number;
    requiredSectionIds?: string[];
  }
): RetrievedSubnettingTcpIpRubric {
  const doc = loadRubricDocument();
  const retrieved = retrieveFromGuidanceDocument(
    doc,
    SUBNETTING_TCPIP_RUBRIC_PATH,
    query,
    {
      topK: options?.topK ?? 4,
      requiredSectionIds: options?.requiredSectionIds ?? [
        ...DEFAULT_NETWORK_TOPOLOGY_FAULT_RUBRIC_SECTION_IDS,
      ],
    }
  );

  return {
    ...retrieved,
    disclaimer:
      typeof doc.disclaimer === 'string' && doc.disclaimer.trim()
        ? doc.disclaimer.trim()
        : null,
  };
}

export function formatRetrievedSubnettingTcpIpRubric(
  retrieved: RetrievedSubnettingTcpIpRubric
): string {
  return formatRetrievedGuidance(retrieved);
}

export function listSubnettingTcpIpRubricSections(): SubnettingTcpIpRubricSection[] {
  return loadRubricDocument().sections.map((section) => ({ ...section }));
}
