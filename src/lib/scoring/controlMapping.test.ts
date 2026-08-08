import { describe, expect, it } from 'vitest';

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

function ticket(overrides: Partial<ScorableTicket> = {}): ScorableTicket {
  return {
    id: 't-map-1',
    tenant_id: 'ten1',
    track_id: 'tr1',
    tier: 2,
    ticket_type: 'control_mapping',
    difficulty: 'medium',
    sla_minutes: 45,
    scenario_brief: 'Map AC-2',
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
    expect(controlMappingFeedback(resolved.structuredResult as never)).toContain(
      'accepted'
    );

    const failed = await scorer.score(
      { answers: { soc2: ['CC7.1'], iso27001: [] } },
      ticket()
    );
    expect(failed.status).toBe('needs_revision');
    expect(failed.feedback).toContain('needs revision');
  });
});
