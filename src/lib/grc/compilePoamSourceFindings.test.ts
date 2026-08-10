import { describe, expect, it } from 'vitest';

import {
  buildPoamSourceGapsMessage,
  resolvePoamSourceLessonTitles,
  summarizeL02Submission,
  toPriorFindingsSeedShape,
  usesStudentPoamSourceFindings,
  type PoamSourceFinding,
} from '@/lib/grc/poamSourceFindingsShared';

describe('usesStudentPoamSourceFindings', () => {
  it('detects explicit flag and sourceFindings config', () => {
    expect(usesStudentPoamSourceFindings({})).toBe(false);
    expect(
      usesStudentPoamSourceFindings({ useStudentSourceFindings: true })
    ).toBe(true);
    expect(
      usesStudentPoamSourceFindings({
        sourceFindings: {
          iamLessonTitle: 'Evidence Collection & Validation',
          l02LessonTitle: 'Navigating NIST SP 800-53',
        },
      })
    ).toBe(true);
  });
});

describe('resolvePoamSourceLessonTitles', () => {
  it('defaults to IAM lab + L02 titles', () => {
    expect(resolvePoamSourceLessonTitles({})).toEqual({
      iamLessonTitle: 'Evidence Collection & Validation',
      l02LessonTitle: 'Navigating NIST SP 800-53',
    });
  });

  it('reads override titles from sourceFindings', () => {
    expect(
      resolvePoamSourceLessonTitles({
        sourceFindings: {
          iamLessonTitle: 'Custom IAM',
          l02LessonTitle: 'Custom L02',
        },
      })
    ).toEqual({
      iamLessonTitle: 'Custom IAM',
      l02LessonTitle: 'Custom L02',
    });
  });
});

describe('summarizeL02Submission', () => {
  it('returns null for empty / unknown payloads', () => {
    expect(summarizeL02Submission(null)).toBeNull();
    expect(summarizeL02Submission({})).toBeNull();
    expect(summarizeL02Submission({ type: 'tool_walkthrough' })).toBeNull();
  });

  it('formats catalog-style control lists + explanation', () => {
    const summary = summarizeL02Submission({
      controlIds: ['ia-1', 'ia-2', 'ia-5'],
      adjacentAcControls: ['ac-7'],
      explanation:
        'AC-2 is account management, not identification/authentication; IA-5 covers authenticators.',
    });
    expect(summary).toContain('Control IDs: ia-1, ia-2, ia-5');
    expect(summary).toContain('Authentication-adjacent AC controls: ac-7');
    expect(summary).toContain('AC-2 is account management');
  });

  it('formats CCCER-shaped lesson_progress submissions', () => {
    const summary = summarizeL02Submission({
      condition: 'Team cited AC-2 for authenticator strength.',
      criteria: 'IA family covers identification and authentication.',
      cause: 'Family confusion between AC and IA.',
      effect: 'Wrong controls shortlisted for the vendor call.',
      recommendation: 'List IA-family controls; note AC-7 as adjacent only.',
    });
    expect(summary).toContain('Condition:');
    expect(summary).toContain('Recommendation:');
  });
});

describe('toPriorFindingsSeedShape / gaps message', () => {
  it('maps source findings into prior_findings seed shape', () => {
    const findings: PoamSourceFinding[] = [
      {
        id: 'finding-1',
        controlId: 'ac-2',
        title: 'Evidence Collection & Validation',
        summary: 'Weak password policy evidence gap.',
        source: 'iam_oscal_finding',
        lessonTitle: 'Evidence Collection & Validation',
        oscalFindingId: 'finding-1',
      },
      {
        id: 'l02:lesson-2',
        title: 'Navigating NIST SP 800-53',
        summary: 'Control IDs: ia-1, ia-5',
        source: 'l02_lesson_progress',
        lessonTitle: 'Navigating NIST SP 800-53',
      },
    ];
    expect(toPriorFindingsSeedShape(findings)).toEqual([
      expect.objectContaining({
        id: 'finding-1',
        control_id: 'ac-2',
        source: 'iam_oscal_finding',
      }),
      expect.objectContaining({
        id: 'l02:lesson-2',
        source: 'l02_lesson_progress',
      }),
    ]);
  });

  it('joins gap messages for empty-state UI', () => {
    expect(
      buildPoamSourceGapsMessage([
        {
          key: 'iam',
          lessonTitle: 'Evidence Collection & Validation',
          message: 'Complete IAM first.',
        },
        {
          key: 'l02',
          lessonTitle: 'Navigating NIST SP 800-53',
          message: 'Complete L02 next.',
        },
      ])
    ).toBe('Complete IAM first. Complete L02 next.');
  });
});
