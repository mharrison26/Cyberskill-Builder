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
 * F26-style retrieval for the pinned customer-communication rubric.
 * Graders must use retrieved section text only — not model memory of support best practices.
 */

export const CUSTOMER_COMMUNICATION_RUBRIC_PATH =
  'data/helpdesk/customer-communication-rubric.json';

export type CustomerCommunicationRubricSection = GuidanceSection;
export type RetrievedCustomerCommunicationRubric = RetrievedGuidance & {
  disclaimer: string | null;
};

let cachedDocument: (GuidanceDocument & { disclaimer?: string }) | null = null;

function loadRubricDocument(): GuidanceDocument & { disclaimer?: string } {
  if (cachedDocument) {
    return cachedDocument;
  }

  const filePath = path.join(
    process.cwd(),
    CUSTOMER_COMMUNICATION_RUBRIC_PATH
  );
  const raw = readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw) as GuidanceDocument & { disclaimer?: string };

  if (!parsed?.sections || !Array.isArray(parsed.sections)) {
    throw new Error(
      `Invalid customer communication rubric file: ${CUSTOMER_COMMUNICATION_RUBRIC_PATH}`
    );
  }

  cachedDocument = parsed;
  return cachedDocument;
}

/** Reset cached document (tests only). */
export function resetCustomerCommunicationRubricCacheForTests(): void {
  cachedDocument = null;
}

export function getCustomerCommunicationRubricSection(
  sectionId: string
): CustomerCommunicationRubricSection {
  const doc = loadRubricDocument();
  const key = sectionId.trim().toLowerCase();
  const section = doc.sections.find((entry) => entry.id.toLowerCase() === key);

  if (!section) {
    throw new Error(
      `Customer communication rubric section not found: ${sectionId}`
    );
  }

  return section;
}

export function listCustomerCommunicationRubricSections(): CustomerCommunicationRubricSection[] {
  return loadRubricDocument().sections.map((section) => ({ ...section }));
}

/** All four rubric criteria — always pinned for anti-hallucination grading. */
export const DEFAULT_CUSTOMER_REPLY_RUBRIC_SECTION_IDS = [
  'acknowledge-frustration',
  'state-next-steps',
  'avoid-jargon',
  'professional-tone',
] as const;

/**
 * Retrieve pinned customer-communication rubric sections for a drafted reply.
 * Defaults to requiring all four criteria so the full rubric is pinned in the prompt.
 */
export function retrieveCustomerCommunicationRubric(
  query: string,
  options?: {
    topK?: number;
    requiredSectionIds?: string[];
  }
): RetrievedCustomerCommunicationRubric {
  const doc = loadRubricDocument();
  const retrieved = retrieveFromGuidanceDocument(
    doc,
    CUSTOMER_COMMUNICATION_RUBRIC_PATH,
    query,
    {
      topK: options?.topK ?? 4,
      requiredSectionIds: options?.requiredSectionIds ?? [
        ...DEFAULT_CUSTOMER_REPLY_RUBRIC_SECTION_IDS,
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

export function formatRetrievedCustomerCommunicationRubric(
  retrieved: RetrievedCustomerCommunicationRubric
): string {
  return formatRetrievedGuidance(retrieved);
}
