import {
  callClaudeGrading,
  MissingAnthropicApiKeyError,
  type ClaudeGradingResult,
} from '@/lib/grading/callClaudeGrading';
import { buildSecurityStrategyCapstoneGradingPrompt } from '@/lib/grading/buildSecurityStrategyCapstoneGradingPrompt';
import { retrieveSecurityStrategyPlanningRubric } from '@/lib/grc/getSecurityStrategyPlanningRubric';
import {
  isSecurityStrategyCapstoneTicketType,
  ISSM_TICKET_CODES,
} from '@/lib/issm/ticketCodes';
import { captureFeatureException } from '@/lib/observability/sentry';
import type {
  ScorableTicket,
  TicketScoreResult,
  TicketScorer,
  TicketSubmission,
} from '@/lib/scoring/index';
import {
  SECURITY_STRATEGY_CAPSTONE_DEFAULT_MIN_MEMO_LENGTH,
  SECURITY_STRATEGY_CAPSTONE_DEFAULT_MIN_OUTCOMES,
  SECURITY_STRATEGY_CAPSTONE_DEFAULT_MIN_PRIORITIES,
  SECURITY_STRATEGY_CAPSTONE_MIN_SECTION_LENGTH,
  SECURITY_STRATEGY_CAPSTONE_REQUIRED_SECTION_KEYS,
} from '@/lib/scoring/ticketUi';

/**
 * ISSM Tier 3 one-year security strategy capstone (ISSM-07 flagship).
 *
 * Deterministic:
 *   - priorities / resourcing / expected outcomes present
 *   - min section lengths + combined memo length
 *   - min priority / outcome counts when structured
 *
 * RAG / LLM (F26 pattern):
 *   - retrieve pinned strategic-planning rubric
 *   - grade memo against retrieved text + ticket scenario only
 *
 * On resolve, submit route marks portfolio_items.is_flagship for this track
 * when ticket_type is flagship-eligible (see isFlagshipEligibleTicketType).
 */

export {
  SECURITY_STRATEGY_CAPSTONE_DEFAULT_MIN_MEMO_LENGTH,
  SECURITY_STRATEGY_CAPSTONE_DEFAULT_MIN_OUTCOMES,
  SECURITY_STRATEGY_CAPSTONE_DEFAULT_MIN_PRIORITIES,
  SECURITY_STRATEGY_CAPSTONE_MIN_SECTION_LENGTH,
  SECURITY_STRATEGY_CAPSTONE_REQUIRED_SECTION_KEYS,
} from '@/lib/scoring/ticketUi';

export {
  isSecurityStrategyCapstoneTicketType,
  ISSM_TICKET_CODES,
  ISSM_TICKET_TYPES,
} from '@/lib/issm/ticketCodes';

export const SECURITY_STRATEGY_CAPSTONE_TICKET_TYPES = [
  'security_strategy_capstone',
  'one_year_security_strategy',
  'issm_strategy_memo_capstone',
] as const;

export type SecurityStrategyCapstoneTicketType =
  (typeof SECURITY_STRATEGY_CAPSTONE_TICKET_TYPES)[number];

export type SecurityStrategyPriority = {
  rank: number;
  title: string;
  rationale: string;
};

export type SecurityStrategyOutcome = {
  title: string;
  metric: string;
};

export type SecurityStrategyCapstoneExpectedState = {
  minMemoLength?: number;
  minSectionLength?: number;
  minPriorities?: number;
  minOutcomes?: number;
  requiredSectionKeys?: string[];
  guidanceTopics?: string[];
  topKGuidanceSections?: number;
  flagshipOnResolve?: boolean;
  flagshipPortfolio?: boolean;
  /** Documented resolve gate; RAG uses finding_state === "satisfied". */
  passThreshold?: string | number;
};

export type SecurityStrategyCapstoneSubmission = {
  type?: string;
  priorities: string | SecurityStrategyPriority[];
  resourcing: string;
  expectedOutcomes: string | SecurityStrategyOutcome[];
  memo?: string;
};

export type SecurityStrategyCapstoneStructuredResult = {
  style: 'security_strategy_capstone';
  flagshipEligible: true;
  ticketCode: typeof ISSM_TICKET_CODES.SECURITY_STRATEGY_CAPSTONE;
  prioritiesLength: number;
  resourcingLength: number;
  outcomesLength: number;
  memoLength: number;
  priorityCount: number;
  outcomeCount: number;
  minMemoLength: number;
  minSectionLength: number;
  minPriorities: number;
  minOutcomes: number;
  requiredSectionKeys: string[];
  missingSections: string[];
  fieldsOk: boolean;
  guidancePath: string | null;
  retrievedSectionIds: string[];
  grading?: {
    finding_state: ClaudeGradingResult['finding_state'];
    strengths: string[];
    gaps: string[];
  };
  reason?: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  return null;
}

function resolvePositiveInt(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  return fallback;
}

function countBulletOrNumberedLines(text: string): number {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const matched = lines.filter((line) =>
    /^(?:[-*•]|\d+[\).]|priority\s*\d+)/i.test(line)
  );
  return matched.length > 0 ? matched.length : lines.length > 0 ? 1 : 0;
}

function parsePriority(
  raw: unknown,
  index: number
): SecurityStrategyPriority | null {
  if (typeof raw === 'string') {
    const title = raw.trim();
    if (!title) return null;
    return { rank: index + 1, title, rationale: '' };
  }
  if (!isPlainObject(raw)) return null;
  const title = asNonEmptyString(
    raw.title ?? raw.name ?? raw.priority ?? raw.text
  );
  if (!title) return null;
  const rationale =
    asNonEmptyString(raw.rationale ?? raw.why ?? raw.justification) ?? '';
  const rank =
    typeof raw.rank === 'number' && Number.isFinite(raw.rank)
      ? Math.floor(raw.rank)
      : index + 1;
  return { rank, title, rationale };
}

function parseOutcome(raw: unknown): SecurityStrategyOutcome | null {
  if (typeof raw === 'string') {
    const title = raw.trim();
    if (!title) return null;
    return { title, metric: '' };
  }
  if (!isPlainObject(raw)) return null;
  const title = asNonEmptyString(
    raw.title ?? raw.outcome ?? raw.name ?? raw.text
  );
  if (!title) return null;
  const metric =
    asNonEmptyString(raw.metric ?? raw.measure ?? raw.target) ?? '';
  return { title, metric };
}

export function parseSecurityStrategyCapstoneExpectedState(
  expectedState: Record<string, unknown> | null | undefined
): SecurityStrategyCapstoneExpectedState {
  if (!isPlainObject(expectedState)) return {};
  return expectedState as SecurityStrategyCapstoneExpectedState;
}

export function formatPrioritiesText(
  priorities: string | SecurityStrategyPriority[]
): string {
  if (typeof priorities === 'string') return priorities.trim();
  return priorities
    .map((entry) => {
      const rationale = entry.rationale.trim()
        ? ` — ${entry.rationale.trim()}`
        : '';
      return `${entry.rank}. ${entry.title.trim()}${rationale}`;
    })
    .join('\n');
}

export function formatOutcomesText(
  outcomes: string | SecurityStrategyOutcome[]
): string {
  if (typeof outcomes === 'string') return outcomes.trim();
  return outcomes
    .map((entry) => {
      const metric = entry.metric.trim() ? ` (${entry.metric.trim()})` : '';
      return `- ${entry.title.trim()}${metric}`;
    })
    .join('\n');
}

export function buildStrategyMemoPreview(parts: {
  priorities: string | SecurityStrategyPriority[];
  resourcing: string;
  expectedOutcomes: string | SecurityStrategyOutcome[];
  memo?: string;
}): string {
  if (parts.memo?.trim()) return parts.memo.trim();
  return [
    '## Top priorities',
    formatPrioritiesText(parts.priorities),
    '',
    '## Resourcing',
    parts.resourcing.trim(),
    '',
    '## Expected outcomes',
    formatOutcomesText(parts.expectedOutcomes),
  ].join('\n');
}

export function extractSecurityStrategyCapstoneSubmission(
  submission: TicketSubmission
): SecurityStrategyCapstoneSubmission | null {
  const resourcing =
    asNonEmptyString(submission.resourcing) ??
    asNonEmptyString(submission.resources) ??
    asNonEmptyString(submission.budgetPlan) ??
    asNonEmptyString(submission.budget_plan);

  const prioritiesRaw =
    submission.priorities ??
    submission.topPriorities ??
    submission.top_priorities;
  const outcomesRaw =
    submission.expectedOutcomes ??
    submission.expected_outcomes ??
    submission.outcomes;

  if (!resourcing || prioritiesRaw == null || outcomesRaw == null) {
    return null;
  }

  let priorities: string | SecurityStrategyPriority[];
  if (typeof prioritiesRaw === 'string') {
    const text = prioritiesRaw.trim();
    if (!text) return null;
    priorities = text;
  } else if (Array.isArray(prioritiesRaw)) {
    const parsed = prioritiesRaw
      .map((entry, index) => parsePriority(entry, index))
      .filter((entry): entry is SecurityStrategyPriority => entry !== null);
    if (parsed.length === 0) return null;
    priorities = parsed;
  } else {
    return null;
  }

  let expectedOutcomes: string | SecurityStrategyOutcome[];
  if (typeof outcomesRaw === 'string') {
    const text = outcomesRaw.trim();
    if (!text) return null;
    expectedOutcomes = text;
  } else if (Array.isArray(outcomesRaw)) {
    const parsed = outcomesRaw
      .map(parseOutcome)
      .filter((entry): entry is SecurityStrategyOutcome => entry !== null);
    if (parsed.length === 0) return null;
    expectedOutcomes = parsed;
  } else {
    return null;
  }

  const memo = asNonEmptyString(submission.memo) ?? undefined;

  return {
    type:
      typeof submission.type === 'string'
        ? submission.type
        : 'security_strategy_capstone',
    priorities,
    resourcing,
    expectedOutcomes,
    memo,
  };
}

function formatRiskProfileText(
  initialState: Record<string, unknown> | null | undefined
): string | undefined {
  if (!isPlainObject(initialState)) return undefined;
  const profile = initialState.riskProfile ?? initialState.risk_profile;
  if (typeof profile === 'string' && profile.trim()) return profile.trim();
  if (!isPlainObject(profile)) return undefined;

  const parts: string[] = [];
  if (typeof profile.overall === 'string' && profile.overall.trim()) {
    parts.push(`Overall residual risk: ${profile.overall.trim()}`);
  }
  if (
    typeof profile.threatContext === 'string' &&
    profile.threatContext.trim()
  ) {
    parts.push(`Threat context: ${profile.threatContext.trim()}`);
  } else if (
    typeof profile.threat_context === 'string' &&
    profile.threat_context.trim()
  ) {
    parts.push(`Threat context: ${profile.threat_context.trim()}`);
  }
  const topRisks = profile.topRisks ?? profile.top_risks;
  if (Array.isArray(topRisks)) {
    for (const risk of topRisks) {
      if (typeof risk === 'string' && risk.trim()) {
        parts.push(`- ${risk.trim()}`);
      } else if (isPlainObject(risk)) {
        const title =
          asNonEmptyString(risk.title ?? risk.name ?? risk.id) ?? 'Risk';
        const severity = asNonEmptyString(risk.severity ?? risk.level);
        const detail = asNonEmptyString(risk.detail ?? risk.description);
        parts.push(
          `- ${title}${severity ? ` [${severity}]` : ''}${detail ? `: ${detail}` : ''}`
        );
      }
    }
  }
  return parts.length > 0 ? parts.join('\n') : undefined;
}

function formatBudgetText(
  initialState: Record<string, unknown> | null | undefined
): string | undefined {
  if (!isPlainObject(initialState)) return undefined;
  const budget = initialState.budget;
  if (typeof budget === 'string' && budget.trim()) return budget.trim();
  if (!isPlainObject(budget)) return undefined;

  const parts: string[] = [];
  if (typeof budget.fiscalYear === 'string' && budget.fiscalYear.trim()) {
    parts.push(`Fiscal year: ${budget.fiscalYear.trim()}`);
  }
  if (typeof budget.totalBudget === 'number') {
    parts.push(
      `Total envelope: $${budget.totalBudget.toLocaleString('en-US')}`
    );
  } else if (
    typeof budget.totalBudget === 'string' &&
    budget.totalBudget.trim()
  ) {
    parts.push(`Total envelope: ${budget.totalBudget.trim()}`);
  }
  for (const key of ['constraints', 'mustFund', 'must_fund'] as const) {
    const list = budget[key];
    if (!Array.isArray(list) || list.length === 0) continue;
    const label = key === 'constraints' ? 'Constraints' : 'Must-fund';
    parts.push(`${label}:`);
    for (const item of list) {
      if (typeof item === 'string' && item.trim()) {
        parts.push(`- ${item.trim()}`);
      }
    }
  }
  return parts.length > 0 ? parts.join('\n') : undefined;
}

function formatPriorFindingsText(
  initialState: Record<string, unknown> | null | undefined
): string | undefined {
  if (!isPlainObject(initialState)) return undefined;
  const findings = initialState.priorFindings ?? initialState.prior_findings;
  if (typeof findings === 'string' && findings.trim()) return findings.trim();
  if (!Array.isArray(findings) || findings.length === 0) return undefined;

  return findings
    .map((finding) => {
      if (typeof finding === 'string') return `- ${finding.trim()}`;
      if (!isPlainObject(finding)) return null;
      const id = asNonEmptyString(finding.id) ?? '';
      const title =
        asNonEmptyString(finding.title ?? finding.name) ?? 'Finding';
      const severity = asNonEmptyString(finding.severity);
      const source = asNonEmptyString(finding.source);
      const status = asNonEmptyString(finding.status);
      const bits = [
        id ? `[${id}]` : null,
        title,
        severity ? `severity=${severity}` : null,
        source ? `source=${source}` : null,
        status ? `status=${status}` : null,
      ]
        .filter(Boolean)
        .join(' ');
      return `- ${bits}`;
    })
    .filter((line): line is string => Boolean(line))
    .join('\n');
}

function resolveOrganizationName(
  initialState: Record<string, unknown> | null | undefined
): string | undefined {
  if (!isPlainObject(initialState)) return undefined;
  const org = initialState.organization ?? initialState.org;
  if (typeof org === 'string' && org.trim()) return org.trim();
  if (isPlainObject(org) && typeof org.name === 'string' && org.name.trim()) {
    return org.name.trim();
  }
  return undefined;
}

export function evaluateSecurityStrategyCapstoneDeterministic(
  submission: TicketSubmission,
  ticket: ScorableTicket
): {
  parsed: SecurityStrategyCapstoneSubmission | null;
  structured: SecurityStrategyCapstoneStructuredResult;
  ok: boolean;
  feedback: string;
} {
  const expected = parseSecurityStrategyCapstoneExpectedState(
    ticket.expected_state
  );
  const initial = isPlainObject(ticket.initial_state)
    ? ticket.initial_state
    : {};

  const minMemoLength = resolvePositiveInt(
    expected.minMemoLength ?? initial.minMemoLength,
    SECURITY_STRATEGY_CAPSTONE_DEFAULT_MIN_MEMO_LENGTH
  );
  const minSectionLength = resolvePositiveInt(
    expected.minSectionLength ?? initial.minSectionLength,
    SECURITY_STRATEGY_CAPSTONE_MIN_SECTION_LENGTH
  );
  const minPriorities = resolvePositiveInt(
    expected.minPriorities ?? initial.minPriorities,
    SECURITY_STRATEGY_CAPSTONE_DEFAULT_MIN_PRIORITIES
  );
  const minOutcomes = resolvePositiveInt(
    expected.minOutcomes ?? initial.minOutcomes,
    SECURITY_STRATEGY_CAPSTONE_DEFAULT_MIN_OUTCOMES
  );
  const requiredSectionKeys =
    expected.requiredSectionKeys && expected.requiredSectionKeys.length > 0
      ? expected.requiredSectionKeys
      : [...SECURITY_STRATEGY_CAPSTONE_REQUIRED_SECTION_KEYS];

  const parsed = extractSecurityStrategyCapstoneSubmission(submission);

  void isSecurityStrategyCapstoneTicketType(ticket.ticket_type);

  if (!parsed) {
    const structured: SecurityStrategyCapstoneStructuredResult = {
      style: 'security_strategy_capstone',
      flagshipEligible: true,
      ticketCode: ISSM_TICKET_CODES.SECURITY_STRATEGY_CAPSTONE,
      prioritiesLength: 0,
      resourcingLength: 0,
      outcomesLength: 0,
      memoLength: 0,
      priorityCount: 0,
      outcomeCount: 0,
      minMemoLength,
      minSectionLength,
      minPriorities,
      minOutcomes,
      requiredSectionKeys,
      missingSections: requiredSectionKeys,
      fieldsOk: false,
      guidancePath: null,
      retrievedSectionIds: [],
      reason: 'missing_fields',
    };
    return {
      parsed: null,
      structured,
      ok: false,
      feedback:
        'Strategy memo must include priorities, resourcing, and expected outcomes.',
    };
  }

  const prioritiesText = formatPrioritiesText(parsed.priorities);
  const outcomesText = formatOutcomesText(parsed.expectedOutcomes);
  const memoText = buildStrategyMemoPreview(parsed);

  const priorityCount = Array.isArray(parsed.priorities)
    ? parsed.priorities.length
    : countBulletOrNumberedLines(prioritiesText);
  const outcomeCount = Array.isArray(parsed.expectedOutcomes)
    ? parsed.expectedOutcomes.length
    : countBulletOrNumberedLines(outcomesText);

  const missingSections: string[] = [];
  if (!prioritiesText) missingSections.push('priorities');
  if (!parsed.resourcing.trim()) missingSections.push('resourcing');
  if (!outcomesText) missingSections.push('expected_outcomes');

  const shortSections: string[] = [];
  if (prioritiesText.length < minSectionLength)
    shortSections.push('priorities');
  if (parsed.resourcing.length < minSectionLength) {
    shortSections.push('resourcing');
  }
  if (outcomesText.length < minSectionLength) {
    shortSections.push('expected_outcomes');
  }

  const structured: SecurityStrategyCapstoneStructuredResult = {
    style: 'security_strategy_capstone',
    flagshipEligible: true,
    ticketCode: ISSM_TICKET_CODES.SECURITY_STRATEGY_CAPSTONE,
    prioritiesLength: prioritiesText.length,
    resourcingLength: parsed.resourcing.length,
    outcomesLength: outcomesText.length,
    memoLength: memoText.length,
    priorityCount,
    outcomeCount,
    minMemoLength,
    minSectionLength,
    minPriorities,
    minOutcomes,
    requiredSectionKeys,
    missingSections,
    fieldsOk: false,
    guidancePath: null,
    retrievedSectionIds: [],
  };

  if (missingSections.length > 0) {
    structured.reason = 'missing_sections';
    return {
      parsed,
      structured,
      ok: false,
      feedback: `Required sections missing or empty: ${missingSections.join(', ')}.`,
    };
  }

  if (shortSections.length > 0) {
    structured.reason = 'sections_too_short';
    return {
      parsed,
      structured,
      ok: false,
      feedback: `Each section must be at least ${minSectionLength} characters. Short: ${shortSections.join(', ')}.`,
    };
  }

  if (priorityCount < minPriorities) {
    structured.reason = 'insufficient_priorities';
    return {
      parsed,
      structured,
      ok: false,
      feedback: `Provide at least ${minPriorities} ranked priorities (found ${priorityCount}).`,
    };
  }

  if (outcomeCount < minOutcomes) {
    structured.reason = 'insufficient_outcomes';
    return {
      parsed,
      structured,
      ok: false,
      feedback: `Provide at least ${minOutcomes} expected outcomes (found ${outcomeCount}).`,
    };
  }

  if (memoText.length < minMemoLength) {
    structured.reason = 'memo_too_short';
    return {
      parsed,
      structured,
      ok: false,
      feedback: `Combined strategy memo must be at least ${minMemoLength} characters (currently ${memoText.length}). Expand priorities, resourcing, and outcomes.`,
    };
  }

  structured.fieldsOk = true;
  return {
    parsed,
    structured,
    ok: true,
    feedback:
      'Deterministic checks passed. Grading strategy memo against strategic-planning rubric…',
  };
}

async function gradeMemoWithRubric(
  parsed: SecurityStrategyCapstoneSubmission,
  ticket: ScorableTicket,
  expected: SecurityStrategyCapstoneExpectedState
): Promise<{
  grading: ClaudeGradingResult;
  retrievedSectionIds: string[];
  guidancePath: string;
}> {
  const prioritiesText = formatPrioritiesText(parsed.priorities);
  const outcomesText = formatOutcomesText(parsed.expectedOutcomes);
  const memoText = buildStrategyMemoPreview(parsed);

  const query = [
    prioritiesText,
    parsed.resourcing,
    outcomesText,
    'strategic planning risk-based prioritization resourcing outcomes findings',
    ...(expected.guidanceTopics ?? []),
  ].join('\n');

  // guidanceTopics are keyword/topic hints for the query; core rubric sections
  // are always pinned via retrieveSecurityStrategyPlanningRubric defaults.
  const retrieved = retrieveSecurityStrategyPlanningRubric(query, {
    topK: expected.topKGuidanceSections ?? 6,
  });

  const prompt = buildSecurityStrategyCapstoneGradingPrompt(retrieved, {
    prioritiesText,
    resourcingText: parsed.resourcing,
    expectedOutcomesText: outcomesText,
    memoText,
    organizationName: resolveOrganizationName(ticket.initial_state),
    scenarioBrief: ticket.scenario_brief,
    riskProfileText: formatRiskProfileText(ticket.initial_state),
    budgetText: formatBudgetText(ticket.initial_state),
    priorFindingsText: formatPriorFindingsText(ticket.initial_state),
  });

  const grading = await callClaudeGrading(prompt);

  return {
    grading,
    retrievedSectionIds: retrieved.sections.map((section) => section.id),
    guidancePath: retrieved.catalogPath,
  };
}

export function createSecurityStrategyCapstoneTicketScorer(): TicketScorer {
  return {
    async score(submission, ticket): Promise<TicketScoreResult> {
      const deterministic = evaluateSecurityStrategyCapstoneDeterministic(
        submission,
        ticket
      );

      if (!deterministic.ok || !deterministic.parsed) {
        return {
          status: 'needs_revision',
          structuredResult: deterministic.structured,
          feedback: deterministic.feedback,
        };
      }

      const expected = parseSecurityStrategyCapstoneExpectedState(
        ticket.expected_state
      );

      try {
        const { grading, retrievedSectionIds, guidancePath } =
          await gradeMemoWithRubric(deterministic.parsed, ticket, expected);

        const structured: SecurityStrategyCapstoneStructuredResult = {
          ...deterministic.structured,
          guidancePath,
          retrievedSectionIds,
          grading: {
            finding_state: grading.finding_state,
            strengths: grading.strengths,
            gaps: grading.gaps,
          },
        };

        const gapHint =
          grading.gaps.length > 0
            ? `\nGaps: ${grading.gaps.slice(0, 3).join(' ')}`
            : '';

        if (grading.finding_state !== 'satisfied') {
          structured.reason = `grading_${grading.finding_state}`;
          return {
            status: 'needs_revision',
            structuredResult: structured,
            feedback: `${grading.feedback}${gapHint}`,
          };
        }

        return {
          status: 'resolved',
          structuredResult: structured,
          feedback: `${grading.feedback}${gapHint}\n\nSecurity strategy capstone complete. This resolution is marked as your track flagship portfolio item (ISSM-07).`,
        };
      } catch (error) {
        if (error instanceof MissingAnthropicApiKeyError) {
          return {
            status: 'resolved',
            structuredResult: {
              ...deterministic.structured,
              reason: 'rag_feedback_unavailable_missing_api_key',
            },
            feedback:
              'Strategy memo sections accepted (length/count checks passed). AI grading against the strategic-planning rubric is unavailable (ANTHROPIC_API_KEY not configured). This resolution is marked as your track flagship portfolio item (ISSM-07).',
          };
        }

        console.error('Security strategy capstone RAG grading failed:', error);
        captureFeatureException(error, {
          feature: 'scoring',
          pi: 'PI-07',
          operation: 'security_strategy_capstone_rag_grade',
          ticketId: ticket.id,
          ticketType: ticket.ticket_type,
          level: 'warning',
        });

        return {
          status: 'resolved',
          structuredResult: {
            ...deterministic.structured,
            reason: 'rag_feedback_error',
          },
          feedback:
            'Strategy memo sections accepted (length/count checks passed). Could not complete AI grading right now. This resolution is marked as your track flagship portfolio item (ISSM-07).',
        };
      }
    },
  };
}

export const securityStrategyCapstoneTicketScorer: TicketScorer =
  createSecurityStrategyCapstoneTicketScorer();
