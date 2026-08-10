import { describe, expect, it } from 'vitest';

import { sortPortfolioItemsFlagshipFirst } from '@/lib/portfolio/sortPortfolioItems';

describe('sortPortfolioItemsFlagshipFirst', () => {
  it('places flagship items first, then newest createdAt', () => {
    const sorted = sortPortfolioItemsFlagshipFirst([
      {
        id: 'a',
        isFlagship: false,
        createdAt: '2026-08-10T12:00:00.000Z',
      },
      {
        id: 'flag',
        isFlagship: true,
        createdAt: '2026-08-01T12:00:00.000Z',
      },
      {
        id: 'b',
        isFlagship: false,
        createdAt: '2026-08-11T12:00:00.000Z',
      },
    ]);

    expect(sorted.map((item) => item.id)).toEqual(['flag', 'b', 'a']);
  });
});
