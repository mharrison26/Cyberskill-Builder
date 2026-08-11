import { describe, expect, it } from 'vitest';

import { getGlossaryTerm, GLOSSARY_TERMS, glossaryHref } from './terms';

describe('glossary terms', () => {
  it('includes core GRC jargon', () => {
    const ids = GLOSSARY_TERMS.map((t) => t.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'poam',
        'conmon',
        'dcwf',
        'high-water-mark',
        'ato',
        'ssp',
        'cccer',
        'sla',
      ])
    );
  });

  it('resolves term lookup and href', () => {
    expect(getGlossaryTerm('poam')?.term).toBe('POA&M');
    expect(glossaryHref('dcwf')).toBe('/help/glossary#dcwf');
  });
});
