import {
  scoreGuidanceSection,
  tokenizeGuidanceQuery,
  type GuidanceSection,
} from '@/lib/grading/retrieveGuidance';
import type { CompiledAuthorizationPackage } from '@/lib/capstone/compilePackage';

const CHUNK_SIZE = 900;

/**
 * Turn compiled package text into keyword-retrievable "sections" for RAG.
 */
export function buildPackageGuidanceSections(
  pkg: CompiledAuthorizationPackage
): GuidanceSection[] {
  const sections: GuidanceSection[] = [];

  for (const artifact of pkg.artifacts) {
    const text = artifact.textCorpus.trim() || artifact.summary;
    if (!text) continue;

    const chunks = chunkText(text, CHUNK_SIZE);
    chunks.forEach((chunk, index) => {
      const id = `${artifact.code.toLowerCase()}-chunk-${index + 1}`;
      sections.push({
        id,
        title: `${artifact.code} ${artifact.label} (part ${index + 1})`,
        topics: [
          artifact.code.toLowerCase(),
          ...artifact.ticketTypes.map((t) => t.toLowerCase()),
          'authorization package',
          'risk acceptance',
        ],
        keywords: [
          artifact.code,
          artifact.label,
          'ssp',
          'poam',
          'oscal',
          'residual risk',
          'weakness',
          'control',
          'milestone',
          'implementation',
        ],
        text: chunk,
      });
    });
  }

  return sections;
}

export function retrievePackageSections(
  pkg: CompiledAuthorizationPackage,
  query: string,
  topK = 6
): GuidanceSection[] {
  const sections = buildPackageGuidanceSections(pkg);
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
    // Prefer positive scores; fill with first chunks if query is sparse.
    if (entry.score > 0 || selected.length < Math.min(3, topK)) {
      selected.push(entry.section);
    }
  }

  if (selected.length === 0) {
    return sections.slice(0, Math.min(topK, sections.length));
  }

  return selected;
}

function chunkText(text: string, size: number): string[] {
  if (text.length <= size) return [text];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    chunks.push(text.slice(start, start + size));
    start += size;
  }
  return chunks;
}
