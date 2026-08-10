import { describe, expect, it } from 'vitest';

import {
  buildControlMappingOverlapGradingPrompt,
  formatRetrievedControlStatement,
  formatRetrievedMappingRows,
} from '@/lib/grading/buildControlMappingOverlapGradingPrompt';
import type { ControlText } from '@/lib/oscal/getControl';
import type { ControlMappingRow } from '@/lib/control-mappings/types';

const control: ControlText = {
  controlId: 'AC-2',
  title: 'Account Management',
  family: 'AC',
  statement:
    'a. Define and document the types of accounts allowed.\nb. Review accounts for compliance with account management requirements.',
  assessmentObjective: '',
  assessmentMethods: { examine: '', interview: '', test: '' },
};

const rows: ControlMappingRow[] = [
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
    target_framework: 'iso27001',
    target_control_id: 'A.5.16',
    mapping_confidence: 'medium',
  },
];

describe('formatRetrievedControlStatement', () => {
  it('includes control id, title, and statement', () => {
    const formatted = formatRetrievedControlStatement(control);
    expect(formatted).toContain('AC-2');
    expect(formatted).toContain('Account Management');
    expect(formatted).toContain('Review accounts');
  });
});

describe('formatRetrievedMappingRows', () => {
  it('includes target ids and confidence', () => {
    const formatted = formatRetrievedMappingRows(rows);
    expect(formatted).toContain('CC6.1');
    expect(formatted).toContain('confidence: high');
    expect(formatted).toContain('A.5.16');
    expect(formatted).toContain('confidence: medium');
  });
});

describe('buildControlMappingOverlapGradingPrompt', () => {
  it('grounds grading in retrieved control statement and mapping rows only', () => {
    const prompt = buildControlMappingOverlapGradingPrompt(control, rows, {
      sourceControlId: 'AC-2',
      selectedMappings: {
        soc2: ['CC6.1'],
        iso27001: ['A.5.16'],
      },
      overlapNarrative:
        'CC6.1 overlaps on logical access but only partially covers AC-2 account review cadence. A.5.16 is a medium-confidence identity lifecycle mapping.',
      scenarioBrief: 'Given control ID AC-2, identify equivalents…',
    });

    expect(prompt).toMatch(/retrieved NIST SP 800-53 control statement/i);
    expect(prompt).toContain('Review accounts');
    expect(prompt).toContain('CC6.1');
    expect(prompt).toContain('confidence: medium');
    expect(prompt).toContain('Overlap narrative');
    expect(prompt).toMatch(/Do not rely on outside knowledge/i);
  });
});
