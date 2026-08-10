import { describe, expect, it } from 'vitest';

import { resolveTrackFilter } from './resolveTrackFilter';

describe('resolveTrackFilter', () => {
  const enrolled = ['grc', 'helpdesk', 'sysadmin'];

  it('returns null for ALL / empty / missing', () => {
    expect(resolveTrackFilter(undefined, enrolled)).toBeNull();
    expect(resolveTrackFilter(null, enrolled)).toBeNull();
    expect(resolveTrackFilter('', enrolled)).toBeNull();
    expect(resolveTrackFilter('   ', enrolled)).toBeNull();
  });

  it('returns the slug when it matches an enrolled track', () => {
    expect(resolveTrackFilter('grc', enrolled)).toBe('grc');
    expect(resolveTrackFilter(' helpdesk ', enrolled)).toBe('helpdesk');
  });

  it('falls back to ALL for unknown slugs', () => {
    expect(resolveTrackFilter('python', enrolled)).toBeNull();
    expect(resolveTrackFilter('GRC', enrolled)).toBeNull();
  });
});
