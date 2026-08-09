/** Client-safe helpers / constants for the GRC-05 SAR summary ticket. */

export const SAR_MIN_SUMMARY_LENGTH = 120;

export type SarPoamRef = {
  findingId: string;
  title?: string;
  weaknessDescription?: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeFindingId(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function parsePoamRef(raw: unknown): SarPoamRef | null {
  if (!isPlainObject(raw)) return null;
  const findingId = normalizeFindingId(
    raw.findingId ?? raw.finding_id ?? raw.id
  );
  if (!findingId) return null;
  const title =
    typeof raw.title === 'string' && raw.title.trim()
      ? raw.title.trim()
      : undefined;
  const weaknessDescription =
    typeof raw.weaknessDescription === 'string' &&
    raw.weaknessDescription.trim()
      ? raw.weaknessDescription.trim()
      : typeof raw.weakness_description === 'string' &&
          raw.weakness_description.trim()
        ? raw.weakness_description.trim()
        : typeof raw.summary === 'string' && raw.summary.trim()
          ? raw.summary.trim()
          : undefined;
  return { findingId, title, weaknessDescription };
}

/** Extract POA&M finding refs from a compiled package payload or seed array. */
export function extractPoamRefsFromPayload(
  payload: Record<string, unknown> | null | undefined
): SarPoamRef[] {
  if (!payload) return [];
  const bags: unknown[] = [];
  if (Array.isArray(payload.poamItems)) bags.push(...payload.poamItems);
  if (Array.isArray(payload.entries)) bags.push(...payload.entries);
  if (Array.isArray(payload.poamEntries)) bags.push(...payload.poamEntries);

  const byId = new Map<string, SarPoamRef>();
  for (const raw of bags) {
    const ref = parsePoamRef(raw);
    if (!ref) continue;
    const existing = byId.get(ref.findingId);
    if (!existing) {
      byId.set(ref.findingId, ref);
      continue;
    }
    byId.set(ref.findingId, {
      findingId: ref.findingId,
      title: existing.title ?? ref.title,
      weaknessDescription:
        existing.weaknessDescription ?? ref.weaknessDescription,
    });
  }
  return Array.from(byId.values());
}

/** Seed fallbacks for admin preview / standalone play. */
export function extractSeedSarPriors(
  initialState: Record<string, unknown> | null | undefined
): {
  sspPayload: Record<string, unknown> | null;
  poamRefs: SarPoamRef[];
} {
  if (!isPlainObject(initialState)) {
    return { sspPayload: null, poamRefs: [] };
  }

  let sspPayload: Record<string, unknown> | null = null;
  if (isPlainObject(initialState.sspFragment)) {
    sspPayload = initialState.sspFragment;
  } else if (isPlainObject(initialState.ssp)) {
    sspPayload = initialState.ssp;
  }

  const poamRaw = Array.isArray(initialState.poamEntries)
    ? initialState.poamEntries
    : Array.isArray(initialState.prior_findings)
      ? initialState.prior_findings
      : [];

  const poamRefs = extractPoamRefsFromPayload({ poamEntries: poamRaw });
  return { sspPayload, poamRefs };
}
