import {
  scoreGuidanceSection,
  tokenizeGuidanceQuery,
  type GuidanceSection,
} from '@/lib/grading/retrieveGuidance';

const CHUNK_SIZE = 700;

export type InfraDesignDocument = {
  title: string;
  body: string;
  topologyChoice?: string;
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
 * Turn a student infrastructure design decision doc into keyword-retrievable
 * sections for RAG question generation and grading.
 */
export function buildDesignDocGuidanceSections(
  doc: InfraDesignDocument
): GuidanceSection[] {
  const sections: GuidanceSection[] = [];
  const title = doc.title.trim() || 'Infrastructure design decision';
  const topology = doc.topologyChoice?.trim();

  if (topology) {
    sections.push({
      id: 'design-topology-choice',
      title: `${title} — topology choice`,
      topics: ['topology', 'decision', 'backup', 'architecture'],
      keywords: [
        'topology',
        'decision',
        'backup',
        '3-2-1',
        'NAS',
        'cloud',
        'immutable',
        topology,
      ],
      text: topology,
    });
  }

  const bodyChunks = chunkText(doc.body, CHUNK_SIZE);
  bodyChunks.forEach((chunk, index) => {
    sections.push({
      id: `design-body-${index + 1}`,
      title: `${title} (part ${index + 1})`,
      topics: [
        'design document',
        'architecture decision',
        'backup topology',
        'tradeoff',
      ],
      keywords: [
        'backup',
        'topology',
        'tradeoff',
        'RPO',
        'RTO',
        'ransomware',
        'restore',
        'NAS',
        'cloud',
        'immutable',
        'offsite',
        'alternative',
        'constraint',
        'budget',
      ],
      text: chunk,
    });
  });

  return sections;
}

export function retrieveDesignDocSections(
  doc: InfraDesignDocument,
  query: string,
  topK = 5
): GuidanceSection[] {
  const sections = buildDesignDocGuidanceSections(doc);
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
    if (entry.score > 0 || selected.length < Math.min(3, topK)) {
      selected.push(entry.section);
    }
  }

  if (selected.length === 0) {
    return sections.slice(0, Math.min(topK, sections.length));
  }

  return selected;
}

export function formatDesignDocForPrompt(doc: InfraDesignDocument): string {
  const parts = [
    `Title: ${doc.title.trim() || '(untitled)'}`,
    doc.topologyChoice?.trim()
      ? `Topology choice: ${doc.topologyChoice.trim()}`
      : null,
    '',
    doc.body.trim(),
  ].filter((line): line is string => line !== null);
  return parts.join('\n');
}
