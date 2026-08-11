/**
 * Short list/header titles for tickets. Prefer authored displayTitle / title
 * fields; never use the full scenario_brief as a table/list label.
 */

export type TicketDisplayTitleSource = {
  ticket_type: string;
  scenario_brief?: string | null;
  initial_state?: Record<string, unknown> | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/** Humanize `control_mapping` → `Control mapping` for fallback labels. */
export function humanizeTicketType(ticketType: string): string {
  const base = ticketType.includes('.')
    ? (ticketType.split('.').pop() ?? ticketType)
    : ticketType;
  const words = base.split(/[_-]+/).filter(Boolean);
  if (words.length === 0) return ticketType;
  return words
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (index > 0 && ['and', 'of', 'for', 'to', 'in', 'on'].includes(lower)) {
        return lower;
      }
      if (lower === 'poam') return 'POA&M';
      if (lower === 'ssp') return 'SSP';
      if (lower === 'raci') return 'RACI';
      if (lower === 'cmmc') return 'CMMC';
      if (lower === 'oscal') return 'OSCAL';
      if (lower === 'fips') return 'FIPS';
      if (lower === 'sec') return 'SEC';
      if (lower === 'conmon') return 'ConMon';
      if (lower === 'ao') return 'AO';
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

/**
 * True when a string looks like a full scenario brief rather than a short
 * list title (paragraph-length or multi-line).
 */
export function looksLikeScenarioBrief(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (trimmed.includes('\n')) return true;
  return trimmed.length > 90;
}

/**
 * Resolve the short display title for console tables / workbench headers.
 * Prefers `scenario.displayTitle`, then top-level / scenario `title`, then a
 * humanized ticket_type — never the raw scenario_brief.
 */
export function resolveTicketDisplayTitle(
  ticket: TicketDisplayTitleSource
): string {
  const state = asRecord(ticket.initial_state);
  const scenario = asRecord(state.scenario);

  const candidates = [
    asString(scenario.displayTitle),
    asString(state.displayTitle),
    asString(state.title),
    asString(scenario.title),
  ];

  for (const candidate of candidates) {
    if (candidate && !looksLikeScenarioBrief(candidate)) {
      return candidate;
    }
  }

  return humanizeTicketType(ticket.ticket_type);
}
