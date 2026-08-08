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
 * F26-style retrieval for the pinned helpdesk SLA / escalation policy.
 * Graders must use retrieved policy section text only.
 */

export const SLA_ESCALATION_POLICY_PATH =
  'data/helpdesk/sla-escalation-policy.json';

export type SlaEscalationPolicySection = GuidanceSection;
export type SlaEscalationPolicyDocument = GuidanceDocument;
export type RetrievedSlaEscalationPolicy = RetrievedGuidance;

let cachedDocument: GuidanceDocument | null = null;

function loadPolicyDocument(): GuidanceDocument {
  if (cachedDocument) {
    return cachedDocument;
  }

  const filePath = path.join(process.cwd(), SLA_ESCALATION_POLICY_PATH);
  const raw = readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw) as GuidanceDocument;

  if (!parsed?.sections || !Array.isArray(parsed.sections)) {
    throw new Error(
      `Invalid SLA escalation policy file: ${SLA_ESCALATION_POLICY_PATH}`
    );
  }

  cachedDocument = parsed;
  return cachedDocument;
}

/** Reset cached document (tests only). */
export function resetSlaEscalationPolicyCacheForTests(): void {
  cachedDocument = null;
}

const DEFAULT_CORE_SECTION_IDS = [
  'tier1-scope',
  'escalate-triggers',
  'decision-test',
] as const;

/**
 * Retrieve pinned SLA/escalation policy sections for a student justification.
 * Always includes core decision sections, then tops up with keyword-ranked matches.
 */
export function retrieveSlaEscalationPolicy(
  query: string,
  options?: {
    topK?: number;
    requiredSectionIds?: string[];
  }
): RetrievedSlaEscalationPolicy {
  const doc = loadPolicyDocument();
  return retrieveFromGuidanceDocument(doc, SLA_ESCALATION_POLICY_PATH, query, {
    topK: options?.topK ?? 5,
    requiredSectionIds: options?.requiredSectionIds ?? [
      ...DEFAULT_CORE_SECTION_IDS,
    ],
  });
}

export function formatRetrievedSlaEscalationPolicy(
  retrieved: RetrievedSlaEscalationPolicy
): string {
  return formatRetrievedGuidance(retrieved);
}

export function listSlaEscalationPolicySections(): SlaEscalationPolicySection[] {
  return loadPolicyDocument().sections.map((section) => ({ ...section }));
}

/** Full policy document for UI display (same pinned text used in grading). */
export function getSlaEscalationPolicyDocument(): SlaEscalationPolicyDocument {
  const doc = loadPolicyDocument();
  return {
    ...doc,
    sections: doc.sections.map((section) => ({ ...section })),
  };
}
