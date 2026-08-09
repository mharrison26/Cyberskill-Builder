/** Client-safe helpers / types for the risk-based audit plan ticket. */

export type RiskRating = 'critical' | 'high' | 'medium' | 'low';

export type RiskRegisterArea = {
  id: string;
  area: string;
  inherentRisk: RiskRating;
  residualRisk: RiskRating;
  lastAuditDate: string;
  materialityNotes: string;
  knownIssues: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeRiskRating(value: unknown): RiskRating | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase().replace(/\s+/g, '_');
  if (
    normalized === 'critical' ||
    normalized === 'crit' ||
    normalized === 'very_high'
  ) {
    return 'critical';
  }
  if (normalized === 'high' || normalized === 'h') return 'high';
  if (
    normalized === 'medium' ||
    normalized === 'moderate' ||
    normalized === 'med' ||
    normalized === 'm'
  ) {
    return 'medium';
  }
  if (normalized === 'low' || normalized === 'l') return 'low';
  return null;
}

export function parseRiskRegister(
  initialState: Record<string, unknown> | null | undefined
): RiskRegisterArea[] {
  if (!isPlainObject(initialState)) return [];

  const raw =
    initialState.riskRegister ??
    initialState.risk_register ??
    initialState.areas ??
    [];
  if (!Array.isArray(raw)) return [];

  const areas: RiskRegisterArea[] = [];
  for (const entry of raw) {
    if (!isPlainObject(entry)) continue;
    const id = asNonEmptyString(entry.id ?? entry.areaId ?? entry.area_id);
    const area = asNonEmptyString(
      entry.area ?? entry.name ?? entry.title ?? entry.auditArea
    );
    const inherentRisk = normalizeRiskRating(
      entry.inherentRisk ?? entry.inherent_risk
    );
    const residualRisk = normalizeRiskRating(
      entry.residualRisk ?? entry.residual_risk
    );
    if (!id || !area || !inherentRisk || !residualRisk) continue;

    areas.push({
      id,
      area,
      inherentRisk,
      residualRisk,
      lastAuditDate:
        asNonEmptyString(entry.lastAuditDate ?? entry.last_audit_date) ??
        'Never',
      materialityNotes:
        asNonEmptyString(
          entry.materialityNotes ??
            entry.materiality_notes ??
            entry.impactNotes ??
            entry.impact
        ) ?? '',
      knownIssues:
        asNonEmptyString(
          entry.knownIssues ?? entry.known_issues ?? entry.issues
        ) ?? '',
    });
  }
  return areas;
}
