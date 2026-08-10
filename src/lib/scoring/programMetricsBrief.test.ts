import { describe, expect, it, vi, beforeEach } from 'vitest';

import type { ScorableTicket } from '@/lib/scoring';
import {
  evaluateProgramMetricsBriefDeterministic,
  extractProgramMetricsBriefSubmission,
  isProgramMetricsBriefTicketType,
  parseProgramMetricsBriefExpectedState,
  programMetricsBriefTicketScorer,
} from '@/lib/scoring/programMetricsBrief';
import { getTicketScorer, listRegisteredTicketTypes } from '@/lib/scoring';

vi.mock('@/lib/grading/callClaudeGrading', () => {
  class MissingAnthropicApiKeyError extends Error {
    constructor() {
      super('ANTHROPIC_API_KEY is not configured');
      this.name = 'MissingAnthropicApiKeyError';
    }
  }

  return {
    MissingAnthropicApiKeyError,
    callClaudeGrading: vi.fn(),
  };
});

import { callClaudeGrading } from '@/lib/grading/callClaudeGrading';

function ticket(overrides: Partial<ScorableTicket> = {}): ScorableTicket {
  return {
    id: 't-pmb-1',
    tenant_id: 'ten1',
    track_id: 'tr1',
    tier: 2,
    ticket_type: 'program_metrics_brief',
    difficulty: 'medium',
    sla_minutes: 45,
    scenario_brief:
      'ProgramMetrics: Select leadership KPIs from HarborLedger FY2026 Q2 program data',
    initial_state: {
      ticketCode: 'ISSO-PM-01',
      prompt:
        'Select and calculate 2–3 metrics meaningful to leadership from the raw program data. Explain why each was chosen.',
      organization: {
        name: 'HarborForge Federal Services',
        system: 'HarborLedger Financial Reporting (ATO High)',
      },
      reportingPeriod: 'FY2026 Q2',
      rawData: {
        poamByAge: { '0_30': 12, '31_60': 8, '61_90': 5, over_90: 7 },
        training: { completed: 420, required: 500 },
        incidents: { total: 14, p1: 1, p2: 3, p3: 10 },
      },
      candidateMetrics: [
        {
          id: 'poam_overdue_rate',
          label: 'POA&M overdue (>90 days) rate',
          formulaHint: 'over_90 / total_poams',
        },
        {
          id: 'training_completion_rate',
          label: 'Training completion rate',
          formulaHint: 'completed / required',
        },
        {
          id: 'high_severity_incident_share',
          label: 'High-severity (P1+P2) incident share',
          formulaHint: '(p1 + p2) / total',
        },
        {
          id: 'distractor_raw_ticket_count',
          label: 'Raw helpdesk ticket volume',
          formulaHint: 'unrelated vanity count',
        },
      ],
      minSelectedMetrics: 2,
      maxSelectedMetrics: 3,
      minRationaleLength: 120,
    },
    expected_state: {
      calculations: {
        poam_overdue_rate: { value: 0.21875, tolerance: 0.01 },
        training_completion_rate: { value: 0.84, tolerance: 0.01 },
        high_severity_incident_share: {
          value: 0.2857142857,
          tolerance: 0.01,
        },
      },
      preferredMetricIds: [
        'poam_overdue_rate',
        'training_completion_rate',
        'high_severity_incident_share',
      ],
      discouragedMetricIds: ['distractor_raw_ticket_count'],
      minSelectedMetrics: 2,
      maxSelectedMetrics: 3,
      minRationaleLength: 120,
      guidanceTopics: [
        'leadership-metric-purpose',
        'poam-aging-and-overdue',
        'training-completion',
        'incident-severity-context',
        'avoid-vanity-metrics',
        'rationale-quality',
      ],
      topKGuidanceSections: 6,
    },
    dcwf_code: '722',
    sort_order: 1,
    ...overrides,
  };
}

const solidRationale =
  'POA&M overdue rate (7/32 ≈ 21.9%) shows remediation backlog risk for the AO; training completion at 84% flags a workforce-control shortfall; high-severity incident share (4/14) puts P1/P2 volume in leadership context rather than raw ticket noise.';

const solidSubmission = {
  type: 'program_metrics_brief',
  selectedMetricIds: ['poam_overdue_rate', 'training_completion_rate'],
  calculations: {
    poam_overdue_rate: 0.21875,
    training_completion_rate: 0.84,
  },
  rationale: solidRationale,
};

describe('programMetricsBrief scorer shape', () => {
  it('registers program_metrics_brief aliases', () => {
    const registered = listRegisteredTicketTypes();
    expect(registered).toContain('program_metrics_brief');
    expect(registered).toContain('leadership_metrics');
    expect(registered).toContain('isso_program_metrics');
    expect(getTicketScorer('program_metrics_brief')).toBe(
      programMetricsBriefTicketScorer
    );
    expect(getTicketScorer('leadership_metrics')).toBe(
      getTicketScorer('program_metrics_brief')
    );
    expect(isProgramMetricsBriefTicketType('program_metrics_brief')).toBe(true);
    expect(isProgramMetricsBriefTicketType('isso_program_metrics')).toBe(true);
  });

  it('parses expected_state calculations and preferred ids', () => {
    const parsed = parseProgramMetricsBriefExpectedState(
      ticket().expected_state
    );
    expect(parsed.calculations?.poam_overdue_rate?.value).toBe(0.21875);
    expect(parsed.calculations?.training_completion_rate?.value).toBe(0.84);
    expect(parsed.preferredMetricIds).toContain('poam_overdue_rate');
    expect(parsed.discouragedMetricIds).toContain(
      'distractor_raw_ticket_count'
    );
    expect(parsed.minRationaleLength).toBe(120);
  });

  it('extracts camelCase and snake_case fields', () => {
    expect(extractProgramMetricsBriefSubmission(solidSubmission)).toMatchObject(
      {
        selectedMetricIds: solidSubmission.selectedMetricIds,
        calculations: solidSubmission.calculations,
        rationale: solidSubmission.rationale,
      }
    );

    const snake = extractProgramMetricsBriefSubmission({
      selected_metric_ids: solidSubmission.selectedMetricIds,
      calculations: solidSubmission.calculations,
      rationale: solidSubmission.rationale,
    });
    expect(snake?.selectedMetricIds).toEqual(solidSubmission.selectedMetricIds);
  });

  it('fails when required fields are missing', () => {
    const missing = evaluateProgramMetricsBriefDeterministic({}, ticket());
    expect(missing.ok).toBe(false);
    expect(missing.structured.style).toBe('program_metrics_brief');
    expect(missing.structured.reason).toBe('missing_fields');
  });

  it('fails when selection count is out of range', () => {
    const tooFew = evaluateProgramMetricsBriefDeterministic(
      {
        ...solidSubmission,
        selectedMetricIds: ['poam_overdue_rate'],
        calculations: { poam_overdue_rate: 0.21875 },
      },
      ticket()
    );
    expect(tooFew.ok).toBe(false);
    expect(tooFew.structured.reason).toBe('selection_count');

    const tooMany = evaluateProgramMetricsBriefDeterministic(
      {
        ...solidSubmission,
        selectedMetricIds: [
          'poam_overdue_rate',
          'training_completion_rate',
          'high_severity_incident_share',
          'distractor_raw_ticket_count',
        ],
        calculations: {
          poam_overdue_rate: 0.21875,
          training_completion_rate: 0.84,
          high_severity_incident_share: 0.2857,
          distractor_raw_ticket_count: 999,
        },
      },
      ticket()
    );
    expect(tooMany.ok).toBe(false);
    expect(tooMany.structured.reason).toBe('selection_count');
  });

  it('fails when rationale is too short', () => {
    const short = evaluateProgramMetricsBriefDeterministic(
      { ...solidSubmission, rationale: 'too short' },
      ticket()
    );
    expect(short.ok).toBe(false);
    expect(short.structured.reason).toBe('rationale_too_short');
  });

  it('fails when calculations are outside tolerance', () => {
    const bad = evaluateProgramMetricsBriefDeterministic(
      {
        ...solidSubmission,
        calculations: {
          poam_overdue_rate: 0.5,
          training_completion_rate: 0.84,
        },
      },
      ticket()
    );
    expect(bad.ok).toBe(false);
    expect(bad.structured.reason).toBe('calculation_mismatch');
    expect(bad.structured.calcsOk).toBe(false);
    const poam = bad.structured.calcMatches.find(
      (m) => m.metricId === 'poam_overdue_rate'
    );
    expect(poam?.matched).toBe(false);
  });

  it('accepts percent form when expected is a rate', () => {
    const result = evaluateProgramMetricsBriefDeterministic(
      {
        ...solidSubmission,
        calculations: {
          poam_overdue_rate: 21.875,
          training_completion_rate: 84,
        },
      },
      ticket()
    );
    expect(result.ok).toBe(true);
    expect(result.structured.calcsOk).toBe(true);
  });

  it('passes deterministic gates with correct calcs and rationale', () => {
    const result = evaluateProgramMetricsBriefDeterministic(
      solidSubmission,
      ticket()
    );
    expect(result.ok).toBe(true);
    expect(result.structured).toMatchObject({
      style: 'program_metrics_brief',
      selectionCountOk: true,
      rationaleOk: true,
      calcsOk: true,
      preferredSelected: ['poam_overdue_rate', 'training_completion_rate'],
    });
    expect(result.structured.calcMatches.every((m) => m.matched)).toBe(true);
  });

  it('includes three preferred metrics with clean expected arithmetic', () => {
    const three = evaluateProgramMetricsBriefDeterministic(
      {
        type: 'program_metrics_brief',
        selectedMetricIds: [
          'poam_overdue_rate',
          'training_completion_rate',
          'high_severity_incident_share',
        ],
        calculations: {
          poam_overdue_rate: 0.21875,
          training_completion_rate: 0.84,
          high_severity_incident_share: 4 / 14,
        },
        rationale: solidRationale,
      },
      ticket()
    );
    expect(three.ok).toBe(true);
    expect(three.structured.selectedCount).toBe(3);
  });
});

describe('programMetricsBriefTicketScorer', () => {
  beforeEach(() => {
    vi.mocked(callClaudeGrading).mockReset();
  });

  it('returns needs_revision without calling Claude when calcs fail', async () => {
    const result = await programMetricsBriefTicketScorer.score(
      {
        ...solidSubmission,
        calculations: {
          poam_overdue_rate: 0.9,
          training_completion_rate: 0.84,
        },
      },
      ticket()
    );
    expect(result.status).toBe('needs_revision');
    expect(callClaudeGrading).not.toHaveBeenCalled();
    expect(result.structuredResult).toMatchObject({
      style: 'program_metrics_brief',
      reason: 'calculation_mismatch',
    });
  });

  it('resolves when Claude returns satisfied against pinned rubric', async () => {
    vi.mocked(callClaudeGrading).mockResolvedValue({
      finding_state: 'satisfied',
      feedback:
        'Strong leadership brief: overdue POA&M rate and training completion are decision-relevant.',
      strengths: ['Chose aging over raw POA&M count', 'Clear AO rationale'],
      gaps: [],
    });

    const result = await programMetricsBriefTicketScorer.score(
      solidSubmission,
      ticket()
    );

    expect(result.status).toBe('resolved');
    expect(callClaudeGrading).toHaveBeenCalledOnce();
    const prompt = vi.mocked(callClaudeGrading).mock.calls[0]?.[0] ?? '';
    expect(prompt).toMatch(/program-metrics/i);
    expect(prompt).toMatch(/POA&M/i);
    expect(result.structuredResult).toMatchObject({
      style: 'program_metrics_brief',
      calcsOk: true,
      grading: { finding_state: 'satisfied' },
    });
  });

  it('needs_revision when Claude finds selection gaps', async () => {
    vi.mocked(callClaudeGrading).mockResolvedValue({
      finding_state: 'not_satisfied',
      feedback: 'Vanity helpdesk volume is not a leadership program metric.',
      strengths: [],
      gaps: ['Selected distractor_raw_ticket_count'],
    });

    const result = await programMetricsBriefTicketScorer.score(
      {
        type: 'program_metrics_brief',
        selectedMetricIds: [
          'training_completion_rate',
          'distractor_raw_ticket_count',
        ],
        calculations: {
          training_completion_rate: 0.84,
          distractor_raw_ticket_count: 412,
        },
        rationale: solidRationale,
      },
      ticket()
    );

    expect(result.status).toBe('needs_revision');
    expect(result.structuredResult).toMatchObject({
      style: 'program_metrics_brief',
      calcsOk: true,
      discouragedSelected: ['distractor_raw_ticket_count'],
      reason: 'grading_not_satisfied',
    });
  });

  it('surfaces missing API key after deterministic pass', async () => {
    const { MissingAnthropicApiKeyError } =
      await import('@/lib/grading/callClaudeGrading');
    vi.mocked(callClaudeGrading).mockRejectedValue(
      new MissingAnthropicApiKeyError()
    );

    const result = await programMetricsBriefTicketScorer.score(
      solidSubmission,
      ticket()
    );

    expect(result.status).toBe('needs_revision');
    expect(result.structuredResult).toMatchObject({
      reason: 'grading_unavailable_missing_api_key',
    });
    expect(result.feedback).toMatch(/ANTHROPIC_API_KEY/i);
  });
});
