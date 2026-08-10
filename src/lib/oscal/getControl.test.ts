import { describe, expect, it } from 'vitest';

import {
  getAssessmentObjectiveText,
  getControlText,
  OSCAL_CATALOG_PATH,
} from './getControl';
import { normalizeControlId } from './parseCatalog';

describe('normalizeControlId', () => {
  it('maps parenthetical notation to dot notation', () => {
    expect(normalizeControlId('IA-5(1)')).toBe('ia-5.1');
    expect(normalizeControlId('ia-5(1)')).toBe('ia-5.1');
  });

  it('normalizes base control ids', () => {
    expect(normalizeControlId('AC-2')).toBe('ac-2');
    expect(normalizeControlId('ac-02')).toBe('ac-2');
  });
});

describe('getControlText', () => {
  it('returns title and statement for ia-5.1', () => {
    const result = getControlText('ia-5.1');

    expect(result.title).toBe('Password-based Authentication');
    expect(result.statement.length).toBeGreaterThan(0);
    expect(result.family).toBeTruthy();
  });

  it('includes SP 800-53A assessment-objective layer for pinned ia-5.1', () => {
    const result = getControlText('ia-5.1');

    expect(result.assessmentObjective.length).toBeGreaterThan(0);
    expect(result.assessmentObjective).toMatch(/password-based authentication/i);
    expect(result.assessmentObjective).toMatch(/commonly used, expected, or compromised passwords/i);
    // Assessment objectives are distinct from the control statement prose.
    expect(result.assessmentObjective).not.toBe(result.statement);
    expect(result.assessmentMethods.examine).toMatch(/password policy/i);
    expect(result.assessmentMethods.interview).toMatch(
      /authenticator management responsibilities/i
    );
    expect(result.assessmentMethods.test).toMatch(
      /password-based authenticator management/i
    );
  });

  it('accepts parenthetical IA-5(1) notation', () => {
    const dot = getControlText('ia-5.1');
    const paren = getControlText('IA-5(1)');

    expect(paren.title).toBe(dot.title);
    expect(paren.statement).toBe(dot.statement);
    expect(paren.assessmentObjective).toBe(dot.assessmentObjective);
  });

  it('returns title and statement for ac-2', () => {
    const lower = getControlText('ac-2');
    const upper = getControlText('AC-2');

    expect(lower.title).toBe('Account Management');
    expect(lower.statement.length).toBeGreaterThan(0);
    expect(upper.title).toBe(lower.title);
    expect(upper.statement).toBe(lower.statement);
  });

  it('includes SP 800-53A assessment objective and methods for ac-2', () => {
    const result = getControlText('ac-2');

    expect(result.assessmentObjective.length).toBeGreaterThan(0);
    expect(result.assessmentObjective.toLowerCase()).toContain('account');
    expect(result.assessmentMethods.examine.length).toBeGreaterThan(0);
    expect(result.assessmentMethods.interview.length).toBeGreaterThan(0);
    expect(result.assessmentMethods.test.length).toBeGreaterThan(0);
  });

  it('throws a clear error for unknown controls', () => {
    expect(() => getControlText('ia-99')).toThrow('Control not found: ia-99');
  });
});

describe('getAssessmentObjectiveText', () => {
  it('retrieves live SP 800-53A assessment content for pinned ia-5.1', () => {
    const result = getAssessmentObjectiveText('ia-5.1');

    expect(result.controlId).toMatch(/IA-5\(1\)/i);
    expect(result.title).toBe('Password-based Authentication');
    expect(result.catalogPath).toBe(OSCAL_CATALOG_PATH);
    expect(result.assessmentObjective).toMatch(
      /commonly used, expected, or compromised passwords/i
    );
    expect(result.assessmentMethods.examine).toMatch(/password configurations/i);
    expect(result.assessmentMethods.interview).toMatch(
      /authenticator management responsibilities/i
    );
    expect(result.assessmentMethods.test).toMatch(
      /password-based authenticator management/i
    );
    // Payload must not expose the 53 control statement for grading.
    expect(result).not.toHaveProperty('statement');
  });

  it('accepts parenthetical IA-5(1) notation for 53A retrieval', () => {
    const base = getAssessmentObjectiveText('ia-5.1');
    const paren = getAssessmentObjectiveText('IA-5(1)');

    expect(paren.assessmentObjective).toBe(base.assessmentObjective);
    expect(paren.assessmentMethods.examine).toBe(base.assessmentMethods.examine);
  });

  it('retrieves live SP 800-53A assessment content for ac-2', () => {
    const result = getAssessmentObjectiveText('ac-2');

    expect(result.controlId).toMatch(/AC-2/i);
    expect(result.title).toBe('Account Management');
    expect(result.catalogPath).toBe(OSCAL_CATALOG_PATH);
    expect(result.assessmentObjective).toMatch(/account managers/i);
    expect(result.assessmentMethods.examine).toMatch(/Access control policy/i);
    expect(result.assessmentMethods.interview).toMatch(
      /account management responsibilities/i
    );
    expect(result.assessmentMethods.test).toMatch(
      /mechanisms for implementing account management/i
    );
  });

  it('accepts parenthetical notation', () => {
    const base = getAssessmentObjectiveText('ac-2');
    const upper = getAssessmentObjectiveText('AC-2');

    expect(upper.assessmentObjective).toBe(base.assessmentObjective);
    expect(upper.assessmentMethods.examine).toBe(
      base.assessmentMethods.examine
    );
  });

  it('throws for unknown controls', () => {
    expect(() => getAssessmentObjectiveText('ia-99')).toThrow(
      'Control not found: ia-99'
    );
  });
});
