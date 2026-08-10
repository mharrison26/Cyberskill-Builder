/** Client-safe helpers / types for the security budget allocation ticket. */

export type SecurityBudgetRequestCategory =
  'tooling' | 'staffing' | 'training' | string;

export type SecurityBudgetRequest = {
  id: string;
  title: string;
  category: SecurityBudgetRequestCategory;
  amountRequested: number;
  riskContext: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const cleaned = value.trim().replace(/[$,]/g, '');
    const n = Number(cleaned);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function parseRequest(raw: unknown): SecurityBudgetRequest | null {
  if (!isPlainObject(raw)) return null;
  const id = asNonEmptyString(raw.id ?? raw.requestId ?? raw.request_id);
  const title = asNonEmptyString(raw.title ?? raw.name ?? raw.label);
  const amountRequested = asFiniteNumber(
    raw.amountRequested ?? raw.amount_requested ?? raw.cost ?? raw.amount
  );
  if (!id || !title || amountRequested === null || amountRequested < 0) {
    return null;
  }
  const category = asNonEmptyString(raw.category ?? raw.type) ?? 'tooling';
  const riskContext =
    asNonEmptyString(
      raw.riskContext ?? raw.risk_context ?? raw.context ?? raw.description
    ) ?? '';
  return {
    id,
    title,
    category,
    amountRequested,
    riskContext,
  };
}

export function parseBudgetRequests(
  initialState: Record<string, unknown> | null | undefined
): SecurityBudgetRequest[] {
  if (!isPlainObject(initialState)) return [];
  const raw = initialState.requests ?? initialState.budgetRequests;
  if (!Array.isArray(raw)) return [];
  return raw
    .map(parseRequest)
    .filter((entry): entry is SecurityBudgetRequest => entry !== null);
}
