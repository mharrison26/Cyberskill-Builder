import {
  scoreGuidanceSection,
  tokenizeGuidanceQuery,
  type GuidanceSection,
} from '@/lib/grading/retrieveGuidance';

const CHUNK_SIZE = 700;

export type ExecutiveSummaryDocument = {
  title?: string;
  body: string;
};

function chunkText(text: string, size: number): string[] {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];
  if (normalized.length <= size) return [normalized];

  const chunks: string[] = [];
  let start = 0;
  while (start < normalized.length) {
    let end = Math.min(start + size, normalized.length);
    if (end < normalized.length) {
      const slice = normalized.slice(start, end);
      const breakAt = Math.max(
        slice.lastIndexOf('\n\n'),
        slice.lastIndexOf('\n'),
        slice.lastIndexOf('. ')
      );
      if (breakAt > size * 0.4) {
        end = start + breakAt + 1;
      }
    }
    chunks.push(normalized.slice(start, end).trim());
    start = end;
  }
  return chunks.filter(Boolean);
}

/**
 * Turn a student executive summary into keyword-retrievable sections for RAG.
 */
export function buildSummaryGuidanceSections(
  doc: ExecutiveSummaryDocument
): GuidanceSection[] {
  const title = doc.title?.trim() || 'Executive summary';
  const bodyChunks = chunkText(doc.body, CHUNK_SIZE);

  return bodyChunks.map((chunk, index) => ({
    id: `summary-body-${index + 1}`,
    title: `${title} (part ${index + 1})`,
    topics: [
      'executive summary',
      'audit committee',
      'findings',
      'remediation',
      'residual risk',
    ],
    keywords: [
      'finding',
      'exception',
      'root cause',
      'remediation',
      'timeline',
      'owner',
      'accountability',
      'residual risk',
      'access',
      'termination',
      'change management',
      'ITGC',
    ],
    text: chunk,
  }));
}

export function retrieveSummarySections(
  doc: ExecutiveSummaryDocument,
  query: string,
  topK = 4
): GuidanceSection[] {
  const sections = buildSummaryGuidanceSections(doc);
  if (sections.length === 0) return [];

  const queryTokens = new Set(tokenizeGuidanceQuery(query));
  const ranked = sections
    .map((section) => ({
      section,
      score: scoreGuidanceSection(section, queryTokens),
    }))
    .sort(
      (a, b) => b.score - a.score || a.section.id.localeCompare(b.section.id)
    );

  const selected: GuidanceSection[] = [];
  for (const entry of ranked) {
    if (selected.length >= topK) break;
    selected.push(entry.section);
  }

  // Ensure at least the first chunk is present even if keyword score is low.
  if (selected.length === 0 && sections[0]) {
    selected.push(sections[0]);
  }
  return selected;
}

export function formatSummaryForPrompt(doc: ExecutiveSummaryDocument): string {
  const title = doc.title?.trim();
  return [title ? `Title: ${title}` : null, doc.body.trim()]
    .filter(Boolean)
    .join('\n\n');
}
