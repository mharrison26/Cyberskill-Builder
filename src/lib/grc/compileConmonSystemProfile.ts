import type { SupabaseClient } from '@supabase/supabase-js';

import { GRC_TICKET_CODES, ticketTypeBase } from '@/lib/capstone/ticketCodes';

/**
 * Compile GRC-06 ConMon starting context from the student's GRC-03 SSP.
 *
 * When useStudentSystemProfile is set, the HarborNet / canned systemProfile
 * seed is NOT used as a fallback — missing GRC-03 work surfaces as a
 * prerequisite gap (same continuity pattern as GRC-04 POA&M source findings).
 */

export const DEFAULT_GRC03_TICKET_TYPES = ['oscal_ssp', 'ssp'] as const;

export type ConmonSystemProfile = {
  name: string;
  description: string;
  authorizationBoundary?: string;
  impact?: string;
  impactLevel?: string;
  environment?: string;
  controlFamilies?: string[];
  /** Extra lines surfaced in the ConMon UI (e.g. SSP control summaries). */
  components?: string[];
  constraints?: string;
};

export type ConmonSystemProfileGap = {
  key: 'grc03';
  message: string;
};

export type CompiledConmonSystemProfile = {
  systemProfile: ConmonSystemProfile | null;
  source: 'student_grc03' | 'seed' | 'empty';
  gaps: ConmonSystemProfileGap[];
  complete: boolean;
  sspTicketId: string | null;
  continuityLabel: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function usesStudentConmonSystemProfile(
  initialState: Record<string, unknown> | null | undefined
): boolean {
  if (!isPlainObject(initialState)) return false;
  if (initialState.useStudentSystemProfile === true) return true;
  if (initialState.use_student_system_profile === true) return true;
  if (initialState.systemProfileSource === 'student_grc03') return true;
  if (initialState.system_profile_source === 'student_grc03') return true;

  const sources =
    initialState.sourceSystemProfile ??
    initialState.source_system_profile ??
    null;
  if (isPlainObject(sources)) {
    if (sources.mode === 'student_grc03') return true;
    if (
      asNonEmptyString(sources.ticketCode) === GRC_TICKET_CODES.SSP ||
      asNonEmptyString(sources.ticket_code) === GRC_TICKET_CODES.SSP
    ) {
      return true;
    }
  }
  return false;
}

export function seedSystemProfileFromInitialState(
  initialState: Record<string, unknown> | null | undefined
): ConmonSystemProfile | null {
  if (!isPlainObject(initialState)) return null;
  const profile = initialState.systemProfile ?? initialState.system_profile;
  if (typeof profile === 'string' && profile.trim()) {
    return {
      name: 'System profile',
      description: profile.trim(),
    };
  }
  if (!isPlainObject(profile)) return null;

  const name =
    asNonEmptyString(profile.name) ??
    asNonEmptyString(profile.systemName) ??
    asNonEmptyString(profile.system_name);
  const description =
    asNonEmptyString(profile.description) ??
    asNonEmptyString(profile.systemDescription) ??
    asNonEmptyString(profile.system_description);
  if (!name && !description) return null;

  const controlFamiliesRaw =
    profile.controlFamilies ?? profile.control_families;
  const controlFamilies = Array.isArray(controlFamiliesRaw)
    ? controlFamiliesRaw
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim().toUpperCase())
        .filter(Boolean)
    : undefined;

  const componentsRaw = profile.components;
  const components = Array.isArray(componentsRaw)
    ? componentsRaw
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter(Boolean)
    : undefined;

  return {
    name: name ?? 'System profile',
    description: description ?? '',
    authorizationBoundary:
      asNonEmptyString(profile.authorizationBoundary) ??
      asNonEmptyString(profile.authorization_boundary) ??
      undefined,
    impact: asNonEmptyString(profile.impact) ?? undefined,
    impactLevel:
      asNonEmptyString(profile.impactLevel) ??
      asNonEmptyString(profile.impact_level) ??
      undefined,
    environment: asNonEmptyString(profile.environment) ?? undefined,
    controlFamilies,
    components,
    constraints: asNonEmptyString(profile.constraints) ?? undefined,
  };
}

/**
 * Pure: pull system-name / description from a compiled OSCAL SSP fragment
 * (or a scorer structured_result that nests `ssp`).
 */
export function extractSystemProfileFromSspPayload(
  payload: Record<string, unknown> | null | undefined
): ConmonSystemProfile | null {
  if (!isPlainObject(payload)) return null;

  const sspRoot = isPlainObject(payload.ssp)
    ? payload.ssp
    : isPlainObject(payload.oscalSsp)
      ? payload.oscalSsp
      : isPlainObject(payload.oscal_ssp)
        ? payload.oscal_ssp
        : payload;

  const plan = isPlainObject(sspRoot['system-security-plan'])
    ? sspRoot['system-security-plan']
    : sspRoot;

  const characteristics = isPlainObject(plan['system-characteristics'])
    ? plan['system-characteristics']
    : null;

  const name =
    asNonEmptyString(characteristics?.['system-name']) ??
    asNonEmptyString(plan['system-name']) ??
    asNonEmptyString(payload.systemName) ??
    asNonEmptyString(payload.system_name);

  const description =
    asNonEmptyString(characteristics?.description) ??
    asNonEmptyString(plan.description) ??
    asNonEmptyString(payload.systemDescription) ??
    asNonEmptyString(payload.system_description);

  if (!name && !description) return null;

  const boundary = isPlainObject(characteristics?.['authorization-boundary'])
    ? characteristics['authorization-boundary']
    : null;
  const authorizationBoundary = asNonEmptyString(boundary?.description);

  const controlLines: string[] = [];
  const controlImpl = isPlainObject(plan['control-implementation'])
    ? plan['control-implementation']
    : null;
  const implemented = Array.isArray(controlImpl?.['implemented-requirements'])
    ? controlImpl['implemented-requirements']
    : [];
  for (const req of implemented) {
    if (!isPlainObject(req)) continue;
    const controlId = asNonEmptyString(req['control-id']);
    const byComponents = Array.isArray(req['by-components'])
      ? req['by-components']
      : [];
    const first = isPlainObject(byComponents[0]) ? byComponents[0] : null;
    const narrative = asNonEmptyString(first?.description);
    if (controlId && narrative) {
      controlLines.push(`${controlId}: ${narrative.slice(0, 180)}`);
    } else if (controlId) {
      controlLines.push(controlId);
    }
  }

  return {
    name: name ?? 'GRC-03 system',
    description:
      description ?? 'System description from your GRC-03 SSP fragment.',
    authorizationBoundary: authorizationBoundary ?? undefined,
    components: controlLines.length > 0 ? controlLines : undefined,
    constraints:
      'ConMon plan continues the system you described in GRC-03 (OSCAL SSP).',
  };
}

export function buildConmonSystemProfileGapsMessage(
  gaps: ConmonSystemProfileGap[]
): string {
  if (gaps.length === 0) {
    return 'Complete GRC-03 (OSCAL SSP) before drafting this ConMon strategy.';
  }
  return gaps.map((gap) => gap.message).join(' ');
}

export type CompileConmonSystemProfileInput = {
  supabase: SupabaseClient;
  studentId: string;
  trackId: string;
  initialState?: Record<string, unknown> | null;
};

/**
 * Load the student's resolved GRC-03 oscal_ssp artifact and map its system
 * characteristics into ConMon systemProfile shape.
 */
export async function compileConmonSystemProfile(
  input: CompileConmonSystemProfileInput
): Promise<CompiledConmonSystemProfile> {
  const continuityLabel =
    'Continues your GRC-03 SSP system description (Tier 2 → Tier 3)';

  const typeSet = new Set(
    DEFAULT_GRC03_TICKET_TYPES.map((t) => t.toLowerCase())
  );

  const { data: tickets, error: ticketsError } = await input.supabase
    .from('tickets')
    .select('id, ticket_type, initial_state, sort_order')
    .eq('track_id', input.trackId);

  if (ticketsError) {
    console.warn(
      '[compileConmonSystemProfile] tickets load:',
      ticketsError.message
    );
    return {
      systemProfile: null,
      source: 'empty',
      gaps: [
        {
          key: 'grc03',
          message:
            'Could not load GRC-03 tickets on this track. Try again, or ask an admin for help.',
        },
      ],
      complete: false,
      sspTicketId: null,
      continuityLabel,
    };
  }

  const sspTickets = (
    (tickets ?? []) as Array<{
      id: string;
      ticket_type: string;
      initial_state: unknown;
      sort_order: number;
    }>
  )
    .filter((t) => typeSet.has(ticketTypeBase(t.ticket_type)))
    .sort((a, b) => a.sort_order - b.sort_order);

  if (sspTickets.length === 0) {
    return {
      systemProfile: null,
      source: 'empty',
      gaps: [
        {
          key: 'grc03',
          message:
            'GRC-03 (OSCAL SSP) was not found on this track. Complete that ticket before drafting ConMon.',
        },
      ],
      complete: false,
      sspTicketId: null,
      continuityLabel,
    };
  }

  const ticketIds = sspTickets.map((t) => t.id);

  const [
    { data: progressRows, error: progressError },
    { data: portfolioRows },
  ] = await Promise.all([
    input.supabase
      .from('ticket_progress')
      .select('ticket_id, status, submission')
      .eq('student_id', input.studentId)
      .in('ticket_id', ticketIds),
    input.supabase
      .from('portfolio_items')
      .select('ticket_id, structured_result, submission, score_status')
      .eq('student_id', input.studentId)
      .in('ticket_id', ticketIds),
  ]);

  if (progressError) {
    console.warn(
      '[compileConmonSystemProfile] ticket_progress:',
      progressError.message
    );
  }

  const progressByTicket = new Map(
    (progressRows ?? []).map((row) => [row.ticket_id as string, row])
  );
  const portfolioByTicket = new Map(
    (portfolioRows ?? []).map((row) => [row.ticket_id as string, row])
  );

  let chosenTicket: (typeof sspTickets)[number] | null = null;
  let profile: ConmonSystemProfile | null = null;

  for (const candidate of sspTickets) {
    const progress = progressByTicket.get(candidate.id);
    const portfolio = portfolioByTicket.get(candidate.id);
    const structured = isPlainObject(portfolio?.structured_result)
      ? portfolio.structured_result
      : {};
    const progressSubmission = isPlainObject(progress?.submission)
      ? progress.submission
      : {};
    const portfolioSubmission = isPlainObject(portfolio?.submission)
      ? portfolio.submission
      : {};
    const merged = {
      ...portfolioSubmission,
      ...structured,
      ...progressSubmission,
    };

    const fromSsp = extractSystemProfileFromSspPayload(merged);
    if (fromSsp) {
      chosenTicket = candidate;
      profile = fromSsp;
      if (
        progress?.status === 'resolved' ||
        portfolio?.score_status === 'resolved'
      ) {
        break;
      }
    }
  }

  // Secondary: GRC-03 ticket seed systemDescription when the student opened
  // the SSP form context but portfolio payload lacked characteristics.
  if (!profile) {
    for (const candidate of sspTickets) {
      const progress = progressByTicket.get(candidate.id);
      const hasProgress = Boolean(progress?.submission || progress?.status);
      if (!hasProgress) continue;
      const initial = isPlainObject(candidate.initial_state)
        ? candidate.initial_state
        : {};
      const name = asNonEmptyString(initial.systemName);
      const description = asNonEmptyString(initial.systemDescription);
      if (name || description) {
        chosenTicket = candidate;
        profile = {
          name: name ?? 'GRC-03 system',
          description:
            description ??
            'System description from your GRC-03 ticket context.',
          authorizationBoundary:
            asNonEmptyString(initial.authorizationBoundary) ?? undefined,
          constraints:
            'ConMon plan continues the system context from your GRC-03 SSP work.',
        };
        break;
      }
    }
  }

  if (!profile) {
    return {
      systemProfile: null,
      source: 'empty',
      gaps: [
        {
          key: 'grc03',
          message:
            'Complete GRC-03 (SSP component writer) and submit your OSCAL SSP fragment before drafting this ConMon strategy. Tier 3 ConMon builds on your own Tier 2 system description — a fresh scenario is not used.',
        },
      ],
      complete: false,
      sspTicketId: sspTickets[0]?.id ?? null,
      continuityLabel,
    };
  }

  // Carry impact / families from ConMon ticket seed when the SSP omits them.
  const seed = seedSystemProfileFromInitialState(input.initialState);
  if (seed) {
    profile = {
      ...profile,
      impact: profile.impact ?? seed.impact,
      impactLevel: profile.impactLevel ?? seed.impactLevel,
      environment: profile.environment ?? seed.environment,
      controlFamilies: profile.controlFamilies ?? seed.controlFamilies,
    };
  }

  return {
    systemProfile: profile,
    source: 'student_grc03',
    gaps: [],
    complete: true,
    sspTicketId: chosenTicket?.id ?? null,
    continuityLabel,
  };
}
