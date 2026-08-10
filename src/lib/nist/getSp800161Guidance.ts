import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * F26-style retrieval for NIST SP 800-161 C-SCRM guidance.
 * Graders must use retrieved section text only — not model memory of SP 800-161.
 */

export const SP800_161_GUIDANCE_PATH = 'data/nist/sp800-161-scrm-guidance.json';

export type Sp800161Section = {
  id: string;
  title: string;
  topics: string[];
  keywords: string[];
  text: string;
};

export type Sp800161GuidanceDocument = {
  document: string;
  title: string;
  source_url: string;
  notes?: string;
  sections: Sp800161Section[];
};

export type RetrievedSp800161Guidance = {
  document: string;
  title: string;
  sourceUrl: string;
  catalogPath: string;
  sections: Sp800161Section[];
};

type GuidanceFile = Sp800161GuidanceDocument;

let cachedDocument: GuidanceFile | null = null;

function loadGuidanceDocument(): GuidanceFile {
  if (cachedDocument) {
    return cachedDocument;
  }

  const filePath = path.join(process.cwd(), SP800_161_GUIDANCE_PATH);
  const raw = readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw) as GuidanceFile;

  if (!parsed?.sections || !Array.isArray(parsed.sections)) {
    throw new Error(
      `Invalid SP 800-161 guidance file: ${SP800_161_GUIDANCE_PATH}`
    );
  }

  cachedDocument = parsed;
  return cachedDocument;
}

/** Reset cached document (tests only). */
export function resetSp800161GuidanceCacheForTests(): void {
  cachedDocument = null;
}

export function getSp800161Section(sectionId: string): Sp800161Section {
  const doc = loadGuidanceDocument();
  const key = sectionId.trim().toLowerCase();
  const section = doc.sections.find((entry) => entry.id.toLowerCase() === key);

  if (!section) {
    throw new Error(`SP 800-161 section not found: ${sectionId}`);
  }

  return section;
}

export function listSp800161Sections(): Sp800161Section[] {
  return loadGuidanceDocument().sections.map((section) => ({ ...section }));
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9+-]+/)
    .filter((token) => token.length >= 3);
}

function scoreSection(
  section: Sp800161Section,
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

  const titleTokens = tokenize(section.title);
  for (const token of titleTokens) {
    if (queryTokens.has(token)) {
      score += 1;
    }
  }

  return score;
}

const DEFAULT_CORE_SECTION_IDS = [
  'c-scrm-overview',
  'inherent-vs-residual',
  'access-criticality',
  'questionnaire-limits',
] as const;

/**
 * Retrieve live (pinned-file) SP 800-161 C-SCRM guidance for vendor risk rating.
 * Always includes core C-SCRM / criticality sections, then tops up with
 * keyword-ranked sections from the query (RAG-style grounding for F26).
 */
export function retrieveSp800161Guidance(
  query: string,
  options?: {
    topK?: number;
    requiredSectionIds?: string[];
  }
): RetrievedSp800161Guidance {
  const doc = loadGuidanceDocument();
  const topK = options?.topK ?? 5;
  const requiredIds = (
    options?.requiredSectionIds ?? [...DEFAULT_CORE_SECTION_IDS]
  ).map((id) => id.toLowerCase());

  const queryTokens = new Set(tokenize(query));
  const byId = new Map(
    doc.sections.map((section) => [section.id.toLowerCase(), section])
  );

  const selected = new Map<string, Sp800161Section>();

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

  const sections = Array.from(selected.values());

  return {
    document: doc.document,
    title: doc.title,
    sourceUrl: doc.source_url,
    catalogPath: SP800_161_GUIDANCE_PATH,
    sections,
  };
}

export function formatRetrievedSp800161Guidance(
  retrieved: RetrievedSp800161Guidance
): string {
  return retrieved.sections
    .map(
      (section) => `### ${section.id} — ${section.title}

${section.text.trim()}`
    )
    .join('\n\n');
}
