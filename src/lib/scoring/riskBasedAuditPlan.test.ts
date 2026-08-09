import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import type { ScorableTicket } from '@/lib/scoring';
import {
  evaluateRiskBasedAuditPlanDeterministic,
  extractRiskBasedAuditPlanSubmission,
  isRiskBasedAuditPlanTicketType,
  parseRiskRegister,
  riskBasedAuditPlanTicketScorer,
} from '@/lib/scoring/riskBasedAuditPlan';
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

const RISK_REGISTER = [
  {
    id: 'R-01',
    area: 'Privileged access / IAM',
    inherentRisk: 'critical',
    residualRisk: 'critical',
    lastAuditDate: '2023-02-15',
    materialityNotes: 'Controls workforce and payment-ops admin access.',
    knownIssues: 'Orphaned admin accounts identified in Q4 access review.',
  },
  {
    id: 'R-02',
    area: 'Change management',
    inherentRisk: 'high',
    residualRisk: 'high',
    lastAuditDate: 'Never',
    materialityNotes: 'Production releases affect payment availability.',
    knownIssues: 'Emergency changes bypass CAB with weak backfill.',
  },
  {
    id: 'R-03',
    area: 'Third-party / cloud SaaS',
    inherentRisk: 'high',
    residualRisk: 'high',
    lastAuditDate: '2022-08-01',
    materialityNotes: 'Core processors and cloud IAM identity providers.',
    knownIssues: 'Several SOC reports older than 12 months.',
  },
  {
    id: 'R-04',
    area: 'Payment processing / PCI',
    inherentRisk: 'critical',
    residualRisk: 'high',
    lastAuditDate: '2024-11-01',
    materialityNotes: 'Cardholder data environment; regulatory exposure.',
    knownIssues: 'Two medium PCI findings still open.',
  },
  {
    id: 'R-05',
    area: 'Security monitoring / IR',
    inherentRisk: 'high',
    residualRisk: 'high',
    lastAuditDate: '2023-09-12',
    materialityNotes: 'Detection gaps affect incident containment.',
    knownIssues: 'SIEM use-case coverage incomplete for payment paths.',
  },
  {
    id: 'R-10',
    area: 'Physical security / facilities',
    inherentRisk: 'medium',
    residualRisk: 'low',
    lastAuditDate: '2025-01-20',
    materialityNotes: 'Office badges; limited payment impact.',
    knownIssues: 'None material.',
  },
  {
    id: 'R-11',
    area: 'Travel and expense',
    inherentRisk: 'low',
    residualRisk: 'low',
    lastAuditDate: '2024-06-01',
    materialityNotes: 'Administrative spend; immaterial to payments.',
    knownIssues: 'None.',
  },
  {
    id: 'R-12',
    area: 'Corporate communications',
    inherentRisk: 'low',
    residualRisk: 'low',
    lastAuditDate: 'Never',
    materialityNotes: 'Brand messaging; low financial impact.',
    knownIssues: 'None.',
  },
];

function ticket(overrides: Partial<ScorableTicket> = {}): ScorableTicket {
  return {
    id: 't-rbap-1',
    tenant_id: 'ten1',
    track_id: 'tr1',
    tier: 3,
    ticket_type: 'risk_based_audit_plan',
    difficulty: 'high',
    sla_minutes: 90,
    scenario_brief:
      'Capstone: Build a prioritized annual audit plan from Meridian Payments risk register',
    initial_state: {
      ticketCode: 'AP-CAP-01',
      auditCapacity: 5,
      organization: {
        name: 'Meridian Payments Inc.',
        industry: 'Payment processing / fintech',
      },
      riskRegister: RISK_REGISTER,
      prompt:
        'Produce a prioritized annual audit plan within capacity of 5 audits.',
    },
    expected_state: {
      auditCapacity: 5,
      minJustificationLength: 60,
      minCapacityNotesLength: 40,
      requireCapacityNotes: true,
      requiredHighRiskAreaIds: ['R-01', 'R-02', 'R-03'],
      requiredWithinTopN: 5,
      lowRiskAreaIds: ['R-10', 'R-11', 'R-12'],
      maxLowRiskInPlan: 1,
      guidanceTopics: [
        'risk-based-priority',
        'justification-quality',
        'capacity-tradeoffs',
        'avoid-low-risk-bias',
      ],
      topKGuidanceSections: 5,
    },
    dcwf_code: '612',
    sort_order: 1,
    ...overrides,
  };
}

const solidJustification =
  'Critical residual risk with open privileged-access issues and stale coverage since 2023; material impact on payment operations and regulatory exposure if admins remain unmonitored.';

const solidCapacityNotes =
  'Deferred physical security, T&E, and communications because residual risk is low and recent or immaterial; will revisit if fraud indicators emerge or board requests coverage.';

function solidPlan(
  areaIds: string[] = ['R-01', 'R-02', 'R-03', 'R-04', 'R-05']
) {
  return {
    type: 'risk_based_audit_plan',
    planEntries: areaIds.map((areaId) => ({
      areaId,
      justification: solidJustification,
    })),
    capacityNotes: solidCapacityNotes,
  };
}

describe('isRiskBasedAuditPlanTicketType', () => {
  it('recognizes primary and alias types', () => {
    expect(isRiskBasedAuditPlanTicketType('risk_based_audit_plan')).toBe(true);
    expect(isRiskBasedAuditPlanTicketType('annual_audit_plan_capstone')).toBe(
      true
    );
    expect(isRiskBasedAuditPlanTicketType('grc.risk_based_audit_plan')).toBe(
      true
    );
    expect(isRiskBasedAuditPlanTicketType('audit_workpaper')).toBe(false);
  });
});

describe('riskBasedAuditPlan scorer registration', () => {
  it('registers risk_based_audit_plan and annual_audit_plan_capstone', () => {
    const registered = listRegisteredTicketTypes();
    expect(registered).toContain('risk_based_audit_plan');
    expect(registered).toContain('annual_audit_plan_capstone');
    expect(getTicketScorer('risk_based_audit_plan')).toBe(
      riskBasedAuditPlanTicketScorer
    );
    expect(getTicketScorer('annual_audit_plan_capstone')).toBe(
      riskBasedAuditPlanTicketScorer
    );
  });
});

describe('parseRiskRegister / extractRiskBasedAuditPlanSubmission', () => {
  it('parses risk register rows from initial_state', () => {
    const areas = parseRiskRegister(ticket().initial_state);
    expect(areas).toHaveLength(RISK_REGISTER.length);
    expect(areas[0]?.id).toBe('R-01');
    expect(areas[0]?.residualRisk).toBe('critical');
  });

  it('extracts plan entries and capacity notes', () => {
    const parsed = extractRiskBasedAuditPlanSubmission(solidPlan());
    expect(parsed?.planEntries).toHaveLength(5);
    expect(parsed?.capacityNotes).toMatch(/Deferred/i);
  });
});

describe('evaluateRiskBasedAuditPlanDeterministic', () => {
  it('rejects missing plan entries', () => {
    const result = evaluateRiskBasedAuditPlanDeterministic({}, ticket());
    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('missing_fields');
  });

  it('rejects wrong plan size vs capacity', () => {
    const result = evaluateRiskBasedAuditPlanDeterministic(
      solidPlan(['R-01', 'R-02', 'R-03']),
      ticket()
    );
    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('wrong_plan_size');
    expect(result.structured.planSize).toBe(3);
    expect(result.structured.auditCapacity).toBe(5);
  });

  it('rejects empty / short justifications', () => {
    const result = evaluateRiskBasedAuditPlanDeterministic(
      {
        type: 'risk_based_audit_plan',
        planEntries: [
          { areaId: 'R-01', justification: 'important' },
          { areaId: 'R-02', justification: solidJustification },
          { areaId: 'R-03', justification: solidJustification },
          { areaId: 'R-04', justification: solidJustification },
          { areaId: 'R-05', justification: solidJustification },
        ],
        capacityNotes: solidCapacityNotes,
      },
      ticket()
    );
    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('justifications_too_short');
    expect(result.structured.shortJustificationAreaIds).toContain('R-01');
  });

  it('rejects missing required high-risk areas', () => {
    const result = evaluateRiskBasedAuditPlanDeterministic(
      solidPlan(['R-01', 'R-04', 'R-05', 'R-10', 'R-11']),
      ticket()
    );
    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('missing_high_risk_areas');
    expect(result.structured.missingRequiredHighRiskAreaIds).toEqual(
      expect.arrayContaining(['R-02', 'R-03'])
    );
  });

  it('rejects low-risk over-prioritization beyond maxLowRiskInPlan', () => {
    const result = evaluateRiskBasedAuditPlanDeterministic(
      solidPlan(['R-01', 'R-02', 'R-03', 'R-11', 'R-12']),
      ticket()
    );
    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('low_risk_over_prioritized');
    expect(result.structured.lowRiskAreaIdsInPlan).toEqual(
      expect.arrayContaining(['R-11', 'R-12'])
    );
  });

  it('rejects missing capacity notes', () => {
    const { capacityNotes: _, ...withoutNotes } = solidPlan();
    void _;
    const result = evaluateRiskBasedAuditPlanDeterministic(
      withoutNotes,
      ticket()
    );
    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('capacity_notes_too_short');
  });

  it('passes a solid risk-based plan of capacity size', () => {
    const result = evaluateRiskBasedAuditPlanDeterministic(
      solidPlan(),
      ticket()
    );
    expect(result.ok).toBe(true);
    expect(result.structured.fieldsOk).toBe(true);
    expect(result.structured.missingRequiredHighRiskAreaIds).toHaveLength(0);
    expect(result.structured.lowRiskAreaIdsInPlan).toHaveLength(0);
  });
});

describe('riskBasedAuditPlanTicketScorer RAG path', () => {
  beforeEach(() => {
    vi.mocked(callClaudeGrading).mockReset();
  });

  afterEach(() => {
    vi.mocked(callClaudeGrading).mockReset();
  });

  it('returns resolved when Claude grades satisfied', async () => {
    vi.mocked(callClaudeGrading).mockResolvedValue({
      finding_state: 'satisfied',
      feedback:
        'Plan correctly elevates critical residual-risk IAM and never-audited change management.',
      strengths: ['High-risk first', 'Capacity tradeoffs noted'],
      gaps: [],
    });

    const result = await riskBasedAuditPlanTicketScorer.score(
      solidPlan(),
      ticket()
    );
    expect(result.status).toBe('resolved');
    expect(result.structuredResult.style).toBe('risk_based_audit_plan');
    expect(callClaudeGrading).toHaveBeenCalledOnce();
  });

  it('returns needs_revision when deterministic gates fail (no Claude call)', async () => {
    const result = await riskBasedAuditPlanTicketScorer.score(
      solidPlan(['R-10', 'R-11', 'R-12', 'R-01', 'R-02']),
      ticket()
    );
    expect(result.status).toBe('needs_revision');
    expect(callClaudeGrading).not.toHaveBeenCalled();
    expect(result.structuredResult.reason).toBe('missing_high_risk_areas');
  });
});
