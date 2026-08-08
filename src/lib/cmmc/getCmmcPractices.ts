import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * F26-style retrieval for CMMC 2.0 Level 2 practice descriptions.
 * Graders must use retrieved practice text only — not model memory of CMMC.
 */

export const CMMC_L2_PRACTICES_PATH = 'data/cmmc/cmmc-l2-practices-subset.json';

export type CmmcPractice = {
  id: string;
  domain: string;
  title: string;
  keywords: string[];
  text: string;
};

export type CmmcPracticesDocument = {
  document: string;
  title: string;
  source_url: string;
  notes?: string;
  practices: CmmcPractice[];
};

export type RetrievedCmmcPractices = {
  document: string;
  title: string;
  sourceUrl: string;
  catalogPath: string;
  practices: CmmcPractice[];
};

type PracticesFile = CmmcPracticesDocument;

let cachedDocument: PracticesFile | null = null;

function loadPracticesDocument(): PracticesFile {
  if (cachedDocument) {
    return cachedDocument;
  }

  const filePath = path.join(process.cwd(), CMMC_L2_PRACTICES_PATH);
  const raw = readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw) as PracticesFile;

  if (!parsed?.practices || !Array.isArray(parsed.practices)) {
    throw new Error(`Invalid CMMC practices file: ${CMMC_L2_PRACTICES_PATH}`);
  }

  cachedDocument = parsed;
  return cachedDocument;
}

/** Reset cached document (tests only). */
export function resetCmmcPracticesCacheForTests(): void {
  cachedDocument = null;
}

export function getCmmcPractice(practiceId: string): CmmcPractice {
  const doc = loadPracticesDocument();
  const key = practiceId.trim().toLowerCase();
  const practice = doc.practices.find(
    (entry) => entry.id.toLowerCase() === key
  );

  if (!practice) {
    throw new Error(`CMMC practice not found: ${practiceId}`);
  }

  return practice;
}

export function listCmmcPractices(): CmmcPractice[] {
  return loadPracticesDocument().practices.map((practice) => ({ ...practice }));
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9+-]+/)
    .filter((token) => token.length >= 3);
}

function scorePractice(
  practice: CmmcPractice,
  queryTokens: Set<string>,
  lowerQuery: string
): number {
  let score = 0;

  for (const keyword of practice.keywords) {
    const keywordLower = keyword.toLowerCase();
    if (lowerQuery.includes(keywordLower)) {
      score += 4;
      continue;
    }

    const parts = tokenize(keyword);
    if (parts.every((part) => queryTokens.has(part))) {
      score += 3;
    } else if (
      parts.some((part) => {
        if (queryTokens.has(part)) return true;
        for (const token of Array.from(queryTokens)) {
          if (token.startsWith(part) || part.startsWith(token)) return true;
        }
        return false;
      })
    ) {
      score += 1;
    }
  }

  if (lowerQuery.includes(practice.id.toLowerCase())) {
    score += 5;
  }

  // Match practice id fragments like "3.1.1" or "ac.l2"
  const idParts = practice.id
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  for (const part of idParts) {
    if (part.length >= 3 && queryTokens.has(part)) {
      score += 2;
    }
  }

  const titleTokens = tokenize(practice.title);
  for (const token of titleTokens) {
    if (queryTokens.has(token)) {
      score += 1;
    }
  }

  const domainHead = practice.domain.toLowerCase().split(/\s+/)[0];
  if (domainHead && queryTokens.has(domainHead)) {
    score += 1;
  }

  return score;
}

/**
 * Retrieve live (pinned-file) CMMC practice descriptions for gap-analysis grading.
 * Always includes required practice IDs (ticket subset), then tops up with
 * keyword-ranked practices from the student narrative (RAG grounding for F26).
 */
export function retrieveCmmcPractices(
  queryText: string,
  options?: {
    topK?: number;
    requiredPracticeIds?: string[];
  }
): RetrievedCmmcPractices {
  const doc = loadPracticesDocument();
  const topK = options?.topK ?? 8;
  const requiredIds = (options?.requiredPracticeIds ?? []).map((id) =>
    id.toLowerCase()
  );

  const lowerQuery = queryText.toLowerCase();
  const queryTokens = new Set(tokenize(queryText));
  const byId = new Map(
    doc.practices.map((practice) => [practice.id.toLowerCase(), practice])
  );

  const selected = new Map<string, CmmcPractice>();

  for (const id of requiredIds) {
    const practice = byId.get(id);
    if (practice) {
      selected.set(practice.id, practice);
    }
  }

  const ranked = doc.practices
    .map((practice) => ({
      practice,
      score: scorePractice(practice, queryTokens, lowerQuery),
    }))
    .filter((entry) => entry.score > 0)
    .sort(
      (a, b) => b.score - a.score || a.practice.id.localeCompare(b.practice.id)
    );

  for (const entry of ranked) {
    if (selected.size >= topK) break;
    selected.set(entry.practice.id, entry.practice);
  }

  // If required set alone exceeds topK, still return all required practices.
  const practices = Array.from(selected.values());

  return {
    document: doc.document,
    title: doc.title,
    sourceUrl: doc.source_url,
    catalogPath: CMMC_L2_PRACTICES_PATH,
    practices,
  };
}

export function formatRetrievedCmmcPractices(
  retrieved: RetrievedCmmcPractices
): string {
  return retrieved.practices
    .map(
      (practice) => `### ${practice.id} — ${practice.title}

Domain: ${practice.domain}

${practice.text.trim()}`
    )
    .join('\n\n');
}
