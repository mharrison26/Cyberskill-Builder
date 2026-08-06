import { describe, expect, it } from 'vitest';

import { getControlText } from './getControl';
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

  it('accepts parenthetical IA-5(1) notation', () => {
    const dot = getControlText('ia-5.1');
    const paren = getControlText('IA-5(1)');

    expect(paren.title).toBe(dot.title);
    expect(paren.statement).toBe(dot.statement);
  });

  it('returns title and statement for ac-2', () => {
    const lower = getControlText('ac-2');
    const upper = getControlText('AC-2');

    expect(lower.title).toBe('Account Management');
    expect(lower.statement.length).toBeGreaterThan(0);
    expect(upper.title).toBe(lower.title);
    expect(upper.statement).toBe(lower.statement);
  });

  it('throws a clear error for unknown controls', () => {
    expect(() => getControlText('ia-99')).toThrow('Control not found: ia-99');
  });
});
