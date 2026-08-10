import { describe, expect, it } from 'vitest';

import {
  buildToolWalkthroughFieldMappingPrompt,
  formatPriorFindingForFieldMapping,
} from '@/lib/grading/buildToolWalkthroughFieldMappingPrompt';

const priorFinding = {
  id: 'finding-iam-1',
  controlId: 'ac-2',
  findingState: 'accepted',
  studentNarrative:
    'Condition: Terminated users retain Okta access.\nCriteria: AC-2 account management.\nCause: Manual deprovisioning.\nEffect: Unauthorized access risk.\nRecommendation: Automate IAM offboarding.',
  observation: {
    feedback: 'Solid CCCER tied to AC-2.',
    strengths: ['Clear condition'],
    gaps: [],
  },
  sourceLessonTitle: 'Evidence Collection & Validation',
};

describe('formatPriorFindingForFieldMapping', () => {
  it('includes the student narrative and source lesson, not a generic key', () => {
    const formatted = formatPriorFindingForFieldMapping(priorFinding);

    expect(formatted).toContain('finding-iam-1');
    expect(formatted).toContain('Evidence Collection & Validation');
    expect(formatted).toContain('Terminated users retain Okta access');
    expect(formatted).toContain('ac-2');
    expect(formatted).not.toContain('generic answer key');
  });
});

describe('buildToolWalkthroughFieldMappingPrompt', () => {
  it('grounds grading in the retrieved prior finding and student reflection', () => {
    const prompt = buildToolWalkthroughFieldMappingPrompt(priorFinding, {
      externalReference: 'RISK-42',
      reflection:
        'Mapped CCCER Condition to SimpleRisk Subject, Criteria to Control tagging, Cause to Notes, and Recommendation to Mitigation plan for RISK-42.',
      storagePath: 'tenant/student/lesson/screenshot.png',
      lessonTitle: 'Open-Source Tracking Workflows',
    });

    expect(prompt).toContain('Open-Source Tracking Workflows');
    expect(prompt).toContain('finding-iam-1');
    expect(prompt).toContain('Terminated users retain Okta access');
    expect(prompt).toContain('RISK-42');
    expect(prompt).toContain('Mapped CCCER Condition to SimpleRisk Subject');
    expect(prompt).toContain('screenshot.png');
    expect(prompt).toMatch(/ONLY the retrieved prior finding/i);
    expect(prompt).not.toMatch(/SP 800-30/);
  });
});
