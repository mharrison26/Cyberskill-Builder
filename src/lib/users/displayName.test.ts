import { describe, expect, it } from 'vitest';

import {
  formatWelcomeBack,
  getAvatarInitials,
  getUserDisplayName,
  normalizeDisplayName,
  validateDisplayName,
} from '@/lib/users/displayName';

describe('normalizeDisplayName', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeDisplayName('  Ada   Lovelace  ')).toBe('Ada Lovelace');
  });

  it('returns null for empty or whitespace-only values', () => {
    expect(normalizeDisplayName('')).toBeNull();
    expect(normalizeDisplayName('   ')).toBeNull();
    expect(normalizeDisplayName(null)).toBeNull();
    expect(normalizeDisplayName(undefined)).toBeNull();
  });
});

describe('getUserDisplayName', () => {
  it('reads display_name and never invents a name from email', () => {
    expect(getUserDisplayName({ display_name: 'Murray Harrison' })).toBe(
      'Murray Harrison'
    );
    expect(getUserDisplayName({ display_name: null, name: null })).toBeNull();
    expect(getUserDisplayName({ displayName: 'Alex' })).toBe('Alex');
  });
});

describe('formatWelcomeBack', () => {
  it('uses the display name when set', () => {
    expect(formatWelcomeBack('Ada')).toBe('Welcome back, Ada.');
  });

  it('falls back to there when unset', () => {
    expect(formatWelcomeBack(null)).toBe('Welcome back, there.');
    expect(formatWelcomeBack('')).toBe('Welcome back, there.');
  });
});

describe('getAvatarInitials', () => {
  it('builds initials from display name', () => {
    expect(getAvatarInitials('Ada Lovelace')).toBe('AL');
    expect(getAvatarInitials('Cher')).toBe('CH');
  });

  it('uses a neutral fallback when unset', () => {
    expect(getAvatarInitials(null)).toBe('?');
    expect(getAvatarInitials('')).toBe('?');
  });
});

describe('validateDisplayName', () => {
  it('requires a non-empty name', () => {
    expect(validateDisplayName('')).toBe('Preferred name is required');
    expect(validateDisplayName('  ')).toBe('Preferred name is required');
  });

  it('accepts a reasonable name', () => {
    expect(validateDisplayName('Murray Harrison')).toBeNull();
  });
});
