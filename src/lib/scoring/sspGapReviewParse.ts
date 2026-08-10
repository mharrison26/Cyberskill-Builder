/**
 * Client-safe SSP gap-review parsers (no Node / OSCAL catalog I/O).
 */

export type SspControlImplementation = {
  controlId: string;
  title: string;
  status: string;
  responsibleRole: string;
  narrative: string;
};

export type SspExcerpt = {
  overview: string;
  roles: string;
  controlImplementations: SspControlImplementation[];
};

export type SspCandidateGap = {
  id: string;
  label: string;
  detail?: string;
  /** Authored teaching rationale shown after grading. */
  rationale?: string;
  /** Optional control id for catalog deep-link (e.g. AC-6). */
  controlId?: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseSspExcerpt(
  initialState: Record<string, unknown> | null | undefined
): SspExcerpt | null {
  if (!isPlainObject(initialState)) return null;
  const raw = initialState.sspExcerpt ?? initialState.ssp_excerpt;
  if (!isPlainObject(raw)) return null;

  const overview =
    typeof raw.overview === 'string'
      ? raw.overview.trim()
      : typeof raw.systemOverview === 'string'
        ? raw.systemOverview.trim()
        : '';
  const roles =
    typeof raw.roles === 'string'
      ? raw.roles.trim()
      : typeof raw.responsibleRoles === 'string'
        ? raw.responsibleRoles.trim()
        : '';

  const controlsRaw =
    raw.controlImplementations ?? raw.control_implementations ?? raw.controls;
  const controlImplementations: SspControlImplementation[] = [];
  if (Array.isArray(controlsRaw)) {
    for (const entry of controlsRaw) {
      if (!isPlainObject(entry)) continue;
      const controlId =
        typeof entry.controlId === 'string'
          ? entry.controlId.trim()
          : typeof entry.control_id === 'string'
            ? entry.control_id.trim()
            : typeof entry.id === 'string'
              ? entry.id.trim()
              : '';
      if (!controlId) continue;
      controlImplementations.push({
        controlId,
        title:
          typeof entry.title === 'string' && entry.title.trim()
            ? entry.title.trim()
            : controlId,
        status:
          typeof entry.status === 'string' && entry.status.trim()
            ? entry.status.trim()
            : typeof entry.implementationStatus === 'string'
              ? entry.implementationStatus.trim()
              : 'Implemented',
        responsibleRole:
          typeof entry.responsibleRole === 'string'
            ? entry.responsibleRole.trim()
            : typeof entry.responsible_role === 'string'
              ? entry.responsible_role.trim()
              : '',
        narrative:
          typeof entry.narrative === 'string'
            ? entry.narrative.trim()
            : typeof entry.statement === 'string'
              ? entry.statement.trim()
              : '',
      });
    }
  }

  if (!overview && controlImplementations.length === 0) return null;
  return { overview, roles, controlImplementations };
}

export function parseSspCandidateGaps(
  initialState: Record<string, unknown> | null | undefined
): SspCandidateGap[] {
  if (!isPlainObject(initialState)) return [];
  const raw =
    initialState.candidateGaps ??
    initialState.candidate_gaps ??
    initialState.findings ??
    initialState.options;
  if (!Array.isArray(raw)) return [];

  const gaps: SspCandidateGap[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (!isPlainObject(entry)) continue;
    const id =
      typeof entry.id === 'string'
        ? entry.id.trim()
        : typeof entry.gapId === 'string'
          ? entry.gapId.trim()
          : '';
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const label =
      typeof entry.label === 'string' && entry.label.trim()
        ? entry.label.trim()
        : typeof entry.title === 'string' && entry.title.trim()
          ? entry.title.trim()
          : typeof entry.description === 'string' && entry.description.trim()
            ? entry.description.trim()
            : id;
    const detail =
      typeof entry.detail === 'string' && entry.detail.trim()
        ? entry.detail.trim()
        : typeof entry.description === 'string' &&
            entry.description.trim() &&
            entry.description.trim() !== label
          ? entry.description.trim()
          : undefined;
    const rationale =
      typeof entry.rationale === 'string' && entry.rationale.trim()
        ? entry.rationale.trim()
        : typeof entry.explanation === 'string' && entry.explanation.trim()
          ? entry.explanation.trim()
          : undefined;
    const controlId =
      typeof entry.controlId === 'string' && entry.controlId.trim()
        ? entry.controlId.trim()
        : typeof entry.control_id === 'string' && entry.control_id.trim()
          ? entry.control_id.trim()
          : undefined;
    gaps.push({ id, label, detail, rationale, controlId });
  }
  return gaps;
}
