import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * F26-style retrieval for pinned SEC cybersecurity disclosure materiality summary.
 * Graders must use retrieved section text only — not model memory of SEC rules.
 */

export const SEC_MATERIALITY_GUIDANCE_PATH =
  'data/sec/cybersecurity-disclosure-materiality.json';

export type SecMaterialitySection = {
  id: string;
  title: string;
  topics: string[];
  keywords: string[];
  text: string;
};

export type SecMaterialityGuidanceDocument = {
  document: string;
  title: string;
  source_url: string;
  notes?: string;
  disclaimer?: string;
  sections: SecMaterialitySection[];
};

export type RetrievedSecMaterialityGuidance = {
  document: string;
  title: string;
  sourceUrl: string;
  catalogPath: string;
  disclaimer: string | null;
  sections: SecMaterialitySection[];
};

let cachedDocument: SecMaterialityGuidanceDocument | null = null;

function loadGuidanceDocument(): SecMaterialityGuidanceDocument {
  if (cachedDocument) {
    return cachedDocument;
  }

  const filePath = path.join(process.cwd(), SEC_MATERIALITY_GUIDANCE_PATH);
  const raw = readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw) as SecMaterialityGuidanceDocument;

  if (!parsed?.sections || !Array.isArray(parsed.sections)) {
    throw new Error(
      `Invalid SEC materiality guidance file: ${SEC_MATERIALITY_GUIDANCE_PATH}`
    );
  }

  cachedDocument = parsed;
  return cachedDocument;
}

/** Reset cached document (tests only). */
export function resetSecMaterialityGuidanceCacheForTests(): void {
  cachedDocument = null;
}

export function getSecMaterialitySection(
  sectionId: string
): SecMaterialitySection {
  const doc = loadGuidanceDocument();
  const key = sectionId.trim().toLowerCase();
  const section = doc.sections.find((entry) => entry.id.toLowerCase() === key);

  if (!section) {
    throw new Error(`SEC materiality section not found: ${sectionId}`);
  }

  return section;
}

export function listSecMaterialitySections(): SecMaterialitySection[] {
  return loadGuidanceDocument().sections.map((section) => ({ ...section }));
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9+-]+/)
    .filter((token) => token.length >= 3);
}

function scoreSection(
  section: SecMaterialitySection,
  queryTokens: Set<string>
): number {
  let score = 0;

  for (const keyword of section.keywords) {
    const parts = tokenize(keyword);
    if (parts.every((part) => queryTokens.has(part))) {
      score += 3;
    } else if (parts.some((part) => queryTokens.has(part))) {
      score += 1;
    }
  }

  for (const topic of section.topics) {
    if (queryTokens.has(topic.toLowerCase())) {
      score += 2;
    }
  }

  for (const token of tokenize(section.title)) {
    if (queryTokens.has(token)) {
      score += 1;
    }
  }

  return score;
}

/** Required factor sections always included for materiality memo grading. */
export const DEFAULT_SEC_MATERIALITY_SECTION_IDS = [
  'rule-overview',
  'reasonable-investor',
  'nature-scope',
  'data-compromise',
  'operational-impact',
  'financial-impact',
  'reputational-legal',
  'timing-determination',
] as const;

/**
 * Retrieve pinned SEC materiality guidance for a student memo.
 * Always includes core factor sections, then tops up with keyword-ranked
 * sections from the query (RAG-style grounding for F26).
 */
export function retrieveSecMaterialityGuidance(
  query: string,
  options?: {
    topK?: number;
    requiredSectionIds?: string[];
  }
): RetrievedSecMaterialityGuidance {
  const doc = loadGuidanceDocument();
  const topK = options?.topK ?? DEFAULT_SEC_MATERIALITY_SECTION_IDS.length;
  const requiredIds = (
    options?.requiredSectionIds ?? [...DEFAULT_SEC_MATERIALITY_SECTION_IDS]
  ).map((id) => id.toLowerCase());

  const queryTokens = new Set(tokenize(query));
  const byId = new Map(
    doc.sections.map((section) => [section.id.toLowerCase(), section])
  );

  const selected = new Map<string, SecMaterialitySection>();

  for (const id of requiredIds) {
    const section = byId.get(id);
    if (section) {
      selected.set(section.id, section);
    }
  }

  const ranked = doc.sections
    .map((section) => ({
      section,
      score: scoreSection(section, queryTokens),
    }))
    .filter((entry) => entry.score > 0)
    .sort(
      (a, b) => b.score - a.score || a.section.id.localeCompare(b.section.id)
    );

  for (const entry of ranked) {
    if (selected.size >= topK) break;
    selected.set(entry.section.id, entry.section);
  }

  return {
    document: doc.document,
    title: doc.title,
    sourceUrl: doc.source_url,
    catalogPath: SEC_MATERIALITY_GUIDANCE_PATH,
    disclaimer: doc.disclaimer ?? doc.notes ?? null,
    sections: Array.from(selected.values()),
  };
}

export function formatRetrievedSecMaterialityGuidance(
  retrieved: RetrievedSecMaterialityGuidance
): string {
  return retrieved.sections
    .map(
      (section) => `### ${section.id} — ${section.title}

${section.text.trim()}`
    )
    .join('\n\n');
}
