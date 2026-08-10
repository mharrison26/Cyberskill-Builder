import { describe, expect, it } from 'vitest';

import { buildAssessmentProcedureGradingPrompt } from '@/lib/grading/buildAssessmentProcedureGradingPrompt';
import {
  getAssessmentObjectiveText,
  getControlText,
} from '@/lib/oscal/getControl';

describe('buildAssessmentProcedureGradingPrompt', () => {
  it('grades against retrieved ia-5.1 SP 800-53A objectives, not the 53 statement', () => {
    const assessment = getAssessmentObjectiveText('ia-5.1');
    const control = getControlText('ia-5.1');
    const prompt = buildAssessmentProcedureGradingPrompt(assessment, {
      examine: 'Review password policy and password configuration settings.',
      interview:
        'Interview personnel with authenticator management responsibilities.',
      test: 'Test mechanisms implementing password-based authenticator management.',
      scenarioBrief: 'GRC-05 IA-5(1) assessment procedures.',
    });

    expect(prompt).toMatch(/SP 800-53A assessment objective/i);
    expect(prompt).toContain(assessment.assessmentObjective.slice(0, 80));
    expect(prompt).toMatch(/password policy/i);
    expect(prompt).not.toContain(control.statement.trim().slice(0, 60));
    expect(prompt).not.toMatch(/control statement/i);
  });
});
