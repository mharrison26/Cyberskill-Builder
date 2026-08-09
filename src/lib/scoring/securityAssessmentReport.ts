import {
  compileStudentPackage,
  type CompiledAuthorizationPackage,
  type CompiledArtifact,
} from '@/lib/capstone/compilePackage';
import {
  DEFAULT_SAR_SOURCE_ARTIFACTS,
  GRC_TICKET_CODES,
  isSecurityAssessmentReportTicketType,
} from '@/lib/capstone/ticketCodes';
import type {
  ScorableTicket,
  TicketScoreResult,
  TicketScorer,
  TicketSubmission,
} from '@/lib/scoring/index';
import {
  extractPoamRefsFromPayload,
  extractSeedSarPriors,
  SAR_MIN_SUMMARY_LENGTH,
  type SarPoamRef,
} from '@/lib/scoring/securityAssessmentReportShared';

export {
  extractPoamRefsFromPayload,
  extractSeedSarPriors,
  SAR_MIN_SUMMARY_LENGTH,
  type SarPoamRef,
} from '@/lib/scoring/securityAssessmentReportShared';

export type SecurityAssessmentReportExpectedState = {
  minSummaryLength?: number;
  requireSspAlignment?: boolean;
};

export type SecurityAssessmentReportStructuredResult = {
  style: 'security_assessment_report';
  summaryLength: number;
  minSummaryLength: number;
  summaryOk: boolean;
  sspPresent: boolean;
  poamPresent: boolean;
  sarPresent: boolean;
  artifactsComplete: boolean;
  consistencyOk: boolean;
  uncoveredPoamIds: string[];
  sspAligned: boolean;
  artifactSource: 'live' | 'seed' | 'mixed' | 'none';
  reason?: string;
};

export type ResolvedSarPriors = {
  sspPayload: Record<string, unknown> | null;
  poamRefs: SarPoamRef[];
  sspSource: 'live' | 'seed' | 'none';
  poamSource: 'live' | 'seed' | 'none';
  artifacts: CompiledArtifact[];
};

export type PackageCompileFn = (
  ticket: ScorableTicket
) => Promise<CompiledAuthorizationPackage>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function resolveMin(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  return fallback;
}

export function parseSarExpectedState(
  expectedState: Record<string, unknown> | null | undefined
): SecurityAssessmentReportExpectedState {
  if (!isPlainObject(expectedState)) return {};
  return expectedState as SecurityAssessmentReportExpectedState;
}

export function extractSarSummary(submission: TicketSubmission): string {
  if (
    typeof submission.sarSummary === 'string' &&
    submission.sarSummary.trim()
  ) {
    return submission.sarSummary.trim();
  }
  if (
    typeof submission.securityAssessmentReport === 'string' &&
    submission.securityAssessmentReport.trim()
  ) {
    return submission.securityAssessmentReport.trim();
  }
  if (typeof submission.summary === 'string' && submission.summary.trim()) {
    return submission.summary.trim();
  }
  if (typeof submission.body === 'string' && submission.body.trim()) {
    return submission.body.trim();
  }
  return '';
}

function artifactByCode(
  artifacts: CompiledArtifact[],
  code: string
): CompiledArtifact | undefined {
  return artifacts.find((a) => a.code === code);
}

/**
 * Prefer live GRC-03 / GRC-04 package artifacts; fall back to initial_state
 * sspFragment + poamEntries for seed/admin preview.
 */
export function mergeSarPriors(
  pkg: CompiledAuthorizationPackage | null,
  initialState: Record<string, unknown> | null | undefined
): ResolvedSarPriors {
  const seed = extractSeedSarPriors(initialState);
  const artifacts = pkg?.artifacts ?? [];

  const sspArtifact = artifactByCode(artifacts, GRC_TICKET_CODES.SSP);
  const poamArtifact = artifactByCode(artifacts, GRC_TICKET_CODES.POAM);

  const liveSsp =
    sspArtifact?.status === 'present' || sspArtifact?.payload
      ? sspArtifact.payload
      : null;
  const livePoamRefs = extractPoamRefsFromPayload(poamArtifact?.payload);

  const sspPayload = liveSsp ?? seed.sspPayload;
  const poamRefs = livePoamRefs.length > 0 ? livePoamRefs : seed.poamRefs;

  const sspSource: ResolvedSarPriors['sspSource'] = liveSsp
    ? 'live'
    : seed.sspPayload
      ? 'seed'
      : 'none';
  const poamSource: ResolvedSarPriors['poamSource'] =
    livePoamRefs.length > 0
      ? 'live'
      : seed.poamRefs.length > 0
        ? 'seed'
        : 'none';

  return {
    sspPayload,
    poamRefs,
    sspSource,
    poamSource,
    artifacts,
  };
}

function normalizeMatchText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** True when SAR text references this POA&M finding (id, title, or weakness). */
export function sarMentionsPoamRef(sarText: string, ref: SarPoamRef): boolean {
  const haystack = normalizeMatchText(sarText);
  const id = normalizeMatchText(ref.findingId);
  if (id && haystack.includes(id)) return true;

  if (ref.title) {
    const title = normalizeMatchText(ref.title);
    if (title.length >= 4 && haystack.includes(title)) return true;
  }

  if (ref.weaknessDescription) {
    const weakness = normalizeMatchText(ref.weaknessDescription);
    const snippet = weakness.slice(0, 40).trim();
    if (snippet.length >= 16 && haystack.includes(snippet)) return true;
  }

  return false;
}

/** Soft SSP alignment: system name / title from SSP appears in the SAR. */
export function sarAlignsWithSsp(
  sarText: string,
  sspPayload: Record<string, unknown> | null
): boolean {
  if (!sspPayload) return false;
  const haystack = normalizeMatchText(sarText);

  const candidates: string[] = [];
  for (const key of [
    'systemName',
    'system_name',
    'sspTitle',
    'title',
    'name',
  ] as const) {
    const value = sspPayload[key];
    if (typeof value === 'string' && value.trim().length >= 4) {
      candidates.push(value.trim());
    }
  }

  const systemChar = sspPayload['system-characteristics'];
  if (isPlainObject(systemChar)) {
    const nested = systemChar['system-name'] ?? systemChar.systemName;
    if (typeof nested === 'string' && nested.trim().length >= 4) {
      candidates.push(nested.trim());
    }
  }

  const sspDoc = sspPayload['system-security-plan'];
  if (isPlainObject(sspDoc)) {
    const meta = sspDoc.metadata;
    if (isPlainObject(meta) && typeof meta.title === 'string') {
      candidates.push(meta.title);
    }
  }

  for (const candidate of candidates) {
    if (haystack.includes(normalizeMatchText(candidate))) return true;
  }

  return (
    haystack.includes('ssp') ||
    haystack.includes('system security plan') ||
    haystack.includes('authorization boundary')
  );
}

export function evaluateSarConsistency(
  sarSummary: string,
  priors: ResolvedSarPriors
): {
  uncoveredPoamIds: string[];
  consistencyOk: boolean;
  sspAligned: boolean;
} {
  const uncoveredPoamIds = priors.poamRefs
    .filter((ref) => !sarMentionsPoamRef(sarSummary, ref))
    .map((ref) => ref.findingId);
  return {
    uncoveredPoamIds,
    consistencyOk: priors.poamRefs.length > 0 && uncoveredPoamIds.length === 0,
    sspAligned: sarAlignsWithSsp(sarSummary, priors.sspPayload),
  };
}

async function defaultCompilePackage(
  ticket: ScorableTicket
): Promise<CompiledAuthorizationPackage> {
  const { createClient } = await import('@/lib/supabase/server');
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Unauthorized');
  }

  const initialState = isPlainObject(ticket.initial_state)
    ? ticket.initial_state
    : {};

  const withSources =
    Array.isArray(initialState.sourceArtifacts) &&
    initialState.sourceArtifacts.length > 0
      ? initialState
      : {
          ...initialState,
          sourceArtifacts: DEFAULT_SAR_SOURCE_ARTIFACTS.map((s) => ({
            code: s.code,
            ticketTypes: [...s.ticketTypes],
            label: s.label,
            ...(s.table ? { table: s.table } : {}),
          })),
        };

  return compileStudentPackage({
    supabase,
    studentId: user.id,
    trackId: ticket.track_id,
    initialState: withSources,
  });
}

export function evaluateSecurityAssessmentReportDeterministic(
  submission: TicketSubmission,
  ticket: ScorableTicket,
  priors: ResolvedSarPriors
): {
  ok: boolean;
  sarSummary: string;
  structured: SecurityAssessmentReportStructuredResult;
  feedback: string;
} {
  const expected = parseSarExpectedState(ticket.expected_state);
  const minSummaryLength = resolveMin(
    expected.minSummaryLength,
    SAR_MIN_SUMMARY_LENGTH
  );
  const requireSspAlignment = expected.requireSspAlignment === true;

  const sarSummary = extractSarSummary(submission);
  const summaryLength = sarSummary.length;
  const summaryOk = summaryLength >= minSummaryLength;
  const sspPresent = priors.sspPayload !== null;
  const poamPresent = priors.poamRefs.length > 0;
  const sarPresent = summaryLength > 0;
  const artifactsComplete = sspPresent && poamPresent && summaryOk;

  const { uncoveredPoamIds, consistencyOk, sspAligned } =
    evaluateSarConsistency(sarSummary, priors);

  let artifactSource: SecurityAssessmentReportStructuredResult['artifactSource'] =
    'none';
  if (priors.sspSource === 'live' && priors.poamSource === 'live') {
    artifactSource = 'live';
  } else if (priors.sspSource === 'seed' && priors.poamSource === 'seed') {
    artifactSource = 'seed';
  } else if (priors.sspSource !== 'none' || priors.poamSource !== 'none') {
    artifactSource = 'mixed';
  }

  void isSecurityAssessmentReportTicketType(ticket.ticket_type);

  const structured: SecurityAssessmentReportStructuredResult = {
    style: 'security_assessment_report',
    summaryLength,
    minSummaryLength,
    summaryOk,
    sspPresent,
    poamPresent,
    sarPresent,
    artifactsComplete,
    consistencyOk,
    uncoveredPoamIds,
    sspAligned,
    artifactSource,
  };

  if (!sspPresent) {
    return {
      ok: false,
      sarSummary,
      structured: { ...structured, reason: 'missing_ssp' },
      feedback:
        'SSP fragment (GRC-03) is missing. Complete the OSCAL SSP ticket first, or use a seed that includes sspFragment for preview.',
    };
  }

  if (!poamPresent) {
    return {
      ok: false,
      sarSummary,
      structured: { ...structured, reason: 'missing_poam' },
      feedback:
        'POA&M entries (GRC-04) are missing. Complete the POA&M ticket first, or use a seed that includes poamEntries for preview.',
    };
  }

  if (!summaryOk) {
    return {
      ok: false,
      sarSummary,
      structured: { ...structured, reason: 'sar_too_short' },
      feedback: `Draft a Security Assessment Report summary of at least ${minSummaryLength} characters describing assessment findings that align with your POA&M items.`,
    };
  }

  if (!consistencyOk) {
    return {
      ok: false,
      sarSummary,
      structured: { ...structured, reason: 'poam_sar_mismatch' },
      feedback: `Your SAR must reference each POA&M finding. Missing coverage for: ${uncoveredPoamIds.join(', ')}. Mention each finding id (or its title/weakness) in the summary.`,
    };
  }

  if (requireSspAlignment && !sspAligned) {
    return {
      ok: false,
      sarSummary,
      structured: { ...structured, reason: 'ssp_misaligned' },
      feedback:
        'Tie the SAR to the system described in your SSP (mention the system name or SSP context) so the authorization package is internally consistent.',
    };
  }

  const alignmentNote = sspAligned
    ? ' SAR also aligns with SSP system context.'
    : ' Tip: mention the SSP system name next time for stronger package coherence.';

  return {
    ok: true,
    sarSummary,
    structured,
    feedback: `Security Assessment Report accepted. SSP fragment, POA&M entries, and SAR summary are present and internally consistent.${alignmentNote}`,
  };
}

export function createSecurityAssessmentReportTicketScorer(
  compile: PackageCompileFn = defaultCompilePackage
): TicketScorer {
  return {
    async score(submission, ticket): Promise<TicketScoreResult> {
      let pkg: CompiledAuthorizationPackage | null = null;
      try {
        pkg = await compile(ticket);
      } catch (error) {
        console.warn(
          '[securityAssessmentReport] package compile failed; trying seed priors:',
          error
        );
        pkg = null;
      }

      const priors = mergeSarPriors(
        pkg,
        isPlainObject(ticket.initial_state) ? ticket.initial_state : {}
      );

      const evaluated = evaluateSecurityAssessmentReportDeterministic(
        submission,
        ticket,
        priors
      );

      return {
        status: evaluated.ok ? 'resolved' : 'needs_revision',
        structuredResult: evaluated.structured,
        feedback: evaluated.feedback,
      };
    },
  };
}

export const securityAssessmentReportTicketScorer: TicketScorer =
  createSecurityAssessmentReportTicketScorer();
