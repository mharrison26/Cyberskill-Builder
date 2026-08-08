/**
 * Shared F26-style guidance retrieval (keyword RAG over pinned JSON corpora).
 * Used by POA&M and available to other ticket graders (e.g. SP 800-30 wrappers).
 */

export type GuidanceSection = {
  id: string;
  title: string;
  topics: string[];
  keywords: string[];
  text: string;
};

export type GuidanceDocument = {
  document: string;
  title: string;
  source_url: string;
  notes?: string;
  sections: GuidanceSection[];
};

export type RetrievedGuidance = {
  document: string;
  title: string;
  sourceUrl: string;
  catalogPath: string;
  sections: GuidanceSection[];
};

export function tokenizeGuidanceQuery(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9+-]+/)
    .filter((token) => token.length >= 3);
}

export function scoreGuidanceSection(
  section: GuidanceSection,
  queryTokens: Set<string>
): number {
  let score = 0;

  for (const keyword of section.keywords) {
    const parts = tokenizeGuidanceQuery(keyword);
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

  for (const token of tokenizeGuidanceQuery(section.title)) {
    if (queryTokens.has(token)) {
      score += 1;
    }
  }

  return score;
}

/**
 * Select required sections, then fill remaining slots with keyword-ranked matches.
 */
export function retrieveFromGuidanceDocument(
  doc: GuidanceDocument,
  catalogPath: string,
  query: string,
  options?: {
    topK?: number;
    requiredSectionIds?: string[];
  }
): RetrievedGuidance {
  const topK = options?.topK ?? 4;
  const requiredIds = (options?.requiredSectionIds ?? []).map((id) =>
    id.toLowerCase()
  );

  const queryTokens = new Set(tokenizeGuidanceQuery(query));
  const byId = new Map(
    doc.sections.map((section) => [section.id.toLowerCase(), section])
  );

  const selected = new Map<string, GuidanceSection>();

  for (const id of requiredIds) {
    const section = byId.get(id);
    if (section) {
      selected.set(section.id, section);
    }
  }

  const ranked = doc.sections
    .map((section) => ({
      section,
      score: scoreGuidanceSection(section, queryTokens),
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
    catalogPath,
    sections: Array.from(selected.values()),
  };
}

export function formatRetrievedGuidance(retrieved: RetrievedGuidance): string {
  return retrieved.sections
    .map(
      (section) => `### ${section.id} — ${section.title}

${section.text.trim()}`
    )
    .join('\n\n');
}
