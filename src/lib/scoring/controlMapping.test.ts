import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/grading/callClaudeGrading', () => {
  return {
    MissingAnthropicApiKeyError: class MissingAnthropicApiKeyError extends Error {
      constructor() {
        super('missing api key');
        this.name = 'MissingAnthropicApiKeyError';
      }
    },
    callClaudeGrading: vi.fn(),
  };
});

vi.mock('@/lib/oscal/getControl', async () => {
  const actual = await vi.importActual<typeof import('@/lib/oscal/getControl')>(
    '@/lib/oscal/getControl'
  );
  return {
    ...actual,
    getControlText: vi.fn(() => ({
      controlId: 'AC-2',
      title: 'Account Management',
      family: 'AC',
      statement:
        'a. Define and document the types of accounts allowed.\nb. Review accounts for compliance with account management requirements.',
      assessmentObjective: '',
      assessmentMethods: { examine: '', interview: '', test: '' },
    })),
  };
});

import { callClaudeGrading } from '@/lib/grading/callClaudeGrading';
import { createMemoryControlMappingLookup } from '@/lib/control-mappings/lookup';
import type { ControlMappingRow } from '@/lib/control-mappings/types';
import type { ScorableTicket } from '@/lib/scoring';
import {
  controlMappingFeedback,
  createControlMappingTicketScorer,
  evaluateControlMapping,
} from '@/lib/scoring/controlMapping';

const ROWS: ControlMappingRow[] = [
  {
    source_framework: 'nist_800_53',
    source_control_id: 'AC-2',
    target_framework: 'soc2',
    target_control_id: 'CC6.1',
    mapping_confidence: 'high',
  },
  {
    source_framework: 'nist_800_53',
    source_control_id: 'AC-2',
    target_framework: 'soc2',
    target_control_id: 'CC6.2',
    mapping_confidence: 'high',
  },
  {
    source_framework: 'nist_800_53',
    source_control_id: 'AC-2',
    target_framework: 'iso27001',
    target_control_id: 'A.5.15',
    mapping_confidence: 'high',
  },
  {
    source_framework: 'nist_800_53',
    source_control_id: 'AC-2',
    target_framework: 'iso27001',
    target_control_id: 'A.5.16',
    mapping_confidence: 'high',
  },
];

const OVERLAP_NARRATIVE =
  'SOC 2 CC6.1/CC6.2 map strongly to logical access aspects of AC-2, but only partially cover AC-2 account review cadence. ISO A.5.15/A.5.16 cover identity lifecycle more closely than a full AC-2 account-management program.';

function ticket(overrides: Partial<ScorableTicket> = {}): ScorableTicket {
  return {
    id: 't-map-1',
    tenant_id: 'ten1',
    track_id: 'tr1',
    tier: 2,
    ticket_type: 'control_mapping',
    difficulty: 'medium',
    sla_minutes: 45,
    scenario_brief:
      "Northwind's new enterprise customer wants written assurance that Northwind's existing SOC 2 report also covers their upcoming ISO 27001 certification needs, and separately, procurement wants to know which 800-53 controls a specific SOC 2 CC6.1 test already partially evidences. Given control ID AC-2, identify its equivalent(s) in SOC 2 (Trust Services Criteria) and ISO 27001:2022 Annex A, and explain where the mappings are strong versus where they only partially overlap.",
    initial_state: {
      source_framework: 'nist_800_53',
      source_control_id: 'AC-2',
      targets: [
        {
          framework: 'soc2',
          options: ['CC6.1', 'CC6.2', 'CC7.1'],
        },
        {
          framework: 'iso27001',
          options: ['A.5.15', 'A.5.16', 'A.5.7'],
        },
      ],
    },
    expected_state: { passThresholdPercent: 100 },
    dcwf_code: '612',
    sort_order: 1,
    ...overrides,
  };
}

describe('evaluateControlMapping', () => {
  const lookup = createMemoryControlMappingLookup(ROWS);

  it('resolves when every option matches the reference crosswalk', async () => {
    const result = await evaluateControlMapping(
      {
        answers: {
          soc2: ['CC6.1', 'CC6.2'],
          iso27001: ['A.5.15', 'A.5.16'],
        },
      },
      ticket(),
      lookup
    );

    expect(result.percentage).toBe(100);
    expect(result.targets.every((t) => t.passed)).toBe(true);
    expect(result.targets[0]?.falsePositives).toEqual([]);
    expect(result.targets[0]?.falseNegatives).toEqual([]);
  });

  it('fails on distractors and missing equivalents without LLM involvement', async () => {
    const result = await evaluateControlMapping(
      {
        answers: {
          soc2: ['CC6.1', 'CC7.1'],
          iso27001: ['A.5.15'],
        },
      },
      ticket(),
      lookup
    );

    expect(result.percentage).toBeLessThan(100);
    const soc2 = result.targets.find((t) => t.framework === 'soc2');
    expect(soc2?.falsePositives).toEqual(['CC7.1']);
    expect(soc2?.falseNegatives).toEqual(['CC6.2']);

    const iso = result.targets.find((t) => t.framework === 'iso27001');
    expect(iso?.falseNegatives).toEqual(['A.5.16']);
  });

  it('normalizes control ID case when comparing selections', async () => {
    const result = await evaluateControlMapping(
      {
        answers: {
          soc2: ['cc6.1', 'cc6.2'],
          iso27001: ['a.5.15', 'a.5.16'],
        },
      },
      ticket(),
      lookup
    );
    expect(result.percentage).toBe(100);
  });

  it('scores via createControlMappingTicketScorer against the lookup', async () => {
    const scorer = createControlMappingTicketScorer(lookup);
    const resolved = await scorer.score(
      {
        answers: {
          soc2: ['CC6.1', 'CC6.2'],
          iso27001: ['A.5.15', 'A.5.16'],
        },
      },
      ticket()
    );
    expect(resolved.status).toBe('resolved');
    expect(
      controlMappingFeedback(resolved.structuredResult as never)
    ).toContain('accepted');

    const failed = await scorer.score(
      { answers: { soc2: ['CC7.1'], iso27001: [] } },
      ticket()
    );
    expect(failed.status).toBe('needs_revision');
    expect(failed.feedback).toContain('needs revision');
  });
});

describe('controlMappingTicketScorer overlap narrative RAG', () => {
  const lookup = createMemoryControlMappingLookup(ROWS);
  const scorer = createControlMappingTicketScorer(lookup);
  const grc01Ticket = () =>
    ticket({
      expected_state: {
        passThresholdPercent: 100,
        gradeOverlapNarrative: true,
        minOverlapNarrativeLength: 120,
      },
    });

  beforeEach(() => {
    vi.mocked(callClaudeGrading).mockReset();
  });

  it('rejects incorrect control IDs before calling Claude', async () => {
    const result = await scorer.score(
      {
        answers: { soc2: ['CC7.1'], iso27001: [] },
        overlapNarrative: OVERLAP_NARRATIVE,
      },
      grc01Ticket()
    );
    expect(result.status).toBe('needs_revision');
    expect(callClaudeGrading).not.toHaveBeenCalled();
    expect(
      (result.structuredResult as { reason?: string }).reason
    ).toBe('control_ids_mismatch');
  });

  it('requires a long enough overlap narrative after IDs pass', async () => {
    const result = await scorer.score(
      {
        answers: {
          soc2: ['CC6.1', 'CC6.2'],
          iso27001: ['A.5.15', 'A.5.16'],
        },
        overlapNarrative: 'too short',
      },
      grc01Ticket()
    );
    expect(result.status).toBe('needs_revision');
    expect(callClaudeGrading).not.toHaveBeenCalled();
    expect(result.feedback).toMatch(/at least 120 characters/i);
  });

  it('resolves when Claude returns satisfied against retrieved AC-2 text', async () => {
    vi.mocked(callClaudeGrading).mockResolvedValue({
      finding_state: 'satisfied',
      feedback: 'Strong vs partial overlap is grounded in AC-2 review cadence.',
      strengths: ['Notes partial CC6.1 coverage'],
      gaps: [],
    });

    const result = await scorer.score(
      {
        answers: {
          soc2: ['CC6.1', 'CC6.2'],
          iso27001: ['A.5.15', 'A.5.16'],
        },
        overlapNarrative: OVERLAP_NARRATIVE,
      },
      grc01Ticket()
    );

    expect(result.status).toBe('resolved');
    expect(callClaudeGrading).toHaveBeenCalledOnce();
    const prompt = vi.mocked(callClaudeGrading).mock.calls[0]?.[0] ?? '';
    expect(prompt).toContain('Review accounts');
    expect(prompt).toContain('CC6.1');
    expect(prompt).toMatch(/Do not rely on outside knowledge/i);
    expect(
      (result.structuredResult as { retrievedControlId?: string })
        .retrievedControlId
    ).toBe('AC-2');
  });
});
