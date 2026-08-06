import { describe, expect, it } from 'vitest';

import {
  mapFindingStateToOscal,
  toAssessmentFinding,
} from './toAssessmentFinding';

describe('mapFindingStateToOscal', () => {
  it('maps DB finding_state values to OSCAL-friendly states', () => {
    expect(mapFindingStateToOscal('accepted')).toBe('satisfied');
    expect(mapFindingStateToOscal('rejected')).toBe('not-satisfied');
    expect(mapFindingStateToOscal('under_review')).toBe(
      'insufficient-evidence'
    );
  });
});

describe('toAssessmentFinding', () => {
  it('builds a minimal assessment finding object', () => {
    const result = toAssessmentFinding({
      id: '550e8400-e29b-41d4-a716-446655440000',
      control_id: 'AC-2',
      finding_state: 'accepted',
      student_narrative: 'Account management policy documented.',
      observation: {
        feedback: 'Strong evidence of quarterly reviews.',
        strengths: 'Clear procedures.',
        gaps: 'Missing privileged account list.',
      },
    });

    expect(result).toEqual({
      uuid: '550e8400-e29b-41d4-a716-446655440000',
      'control-id': 'AC-2',
      description: 'Account management policy documented.',
      'related-observations': [
        {
          feedback: 'Strong evidence of quarterly reviews.',
          strengths: 'Clear procedures.',
          gaps: 'Missing privileged account list.',
        },
      ],
      state: 'satisfied',
    });
  });

  it('falls back to observation feedback for description', () => {
    const result = toAssessmentFinding({
      id: 'finding-1',
      control_id: 'AU-6',
      finding_state: 'rejected',
      student_narrative: null,
      observation: {
        feedback: 'Audit review logs are incomplete.',
      },
    });

    expect(result.description).toBe('Audit review logs are incomplete.');
    expect(result.state).toBe('not-satisfied');
  });
});
