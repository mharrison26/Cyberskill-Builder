import { describe, expect, it } from 'vitest';

import {
  detectOscalDocumentKind,
  validateOscal,
  validateOscalDocument,
} from '@/lib/oscal/validateOscal';

const UUID = '11111111-1111-4111-8111-111111111111';
const NOW = '2024-01-15T12:00:00Z';

function minimalSsp() {
  return {
    'system-security-plan': {
      uuid: UUID,
      metadata: {
        title: 'Minimal SSP',
        'last-modified': NOW,
        version: '1.0',
        'oscal-version': '1.1.2',
      },
      'import-profile': { href: '#profile' },
      'system-characteristics': {
        'system-ids': [{ id: 'SYS-1' }],
        'system-name': 'Demo System',
        description: 'A demo system for the lab.',
        'system-information': {
          'information-types': [
            {
              uuid: UUID,
              title: 'Business info',
              description: 'General business information.',
              categorizations: [
                {
                  system: 'https://doi.org/10.6028/NIST.SP.800-60v2r1',
                  'information-type-ids': ['C.2.8.12'],
                },
              ],
              'confidentiality-impact': { base: 'fips-199-low' },
              'integrity-impact': { base: 'fips-199-low' },
              'availability-impact': { base: 'fips-199-low' },
            },
          ],
        },
        'security-impact-level': {
          'security-objective-confidentiality': 'fips-199-low',
          'security-objective-integrity': 'fips-199-low',
          'security-objective-availability': 'fips-199-low',
        },
        status: { state: 'operational' },
        'authorization-boundary': { description: 'Boundary description.' },
      },
      'system-implementation': {
        users: [{ uuid: UUID, title: 'System Admin' }],
        components: [
          {
            uuid: UUID,
            type: 'system',
            title: 'Demo System',
            description: 'Primary system component.',
            status: { state: 'operational' },
          },
        ],
      },
      'control-implementation': {
        description: 'Control implementation summary.',
        'implemented-requirements': [
          {
            uuid: UUID,
            'control-id': 'ac-1',
          },
        ],
      },
    },
  };
}

function minimalAr() {
  return {
    'assessment-results': {
      uuid: UUID,
      metadata: {
        title: 'Minimal AR',
        'last-modified': NOW,
        version: '1.0',
        'oscal-version': '1.1.2',
      },
      'import-ap': { href: '#assessment-plan' },
      results: [
        {
          uuid: UUID,
          title: 'Result 1',
          description: 'Assessment result.',
          start: NOW,
          'reviewed-controls': {
            'control-selections': [
              {
                'include-controls': [{ 'control-id': 'ac-1' }],
              },
            ],
          },
        },
      ],
    },
  };
}

describe('validateOscalDocument', () => {
  it('accepts a minimal valid SSP', () => {
    const result = validateOscalDocument(minimalSsp(), 'ssp');
    expect(result.valid).toBe(true);
    expect(result.kind).toBe('ssp');
  });

  it('rejects an incomplete SSP', () => {
    const result = validateOscalDocument(
      { 'system-security-plan': { uuid: UUID } },
      'ssp'
    );
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('accepts a minimal valid Assessment Results document', () => {
    const result = validateOscalDocument(minimalAr(), 'assessment-results');
    expect(result.valid).toBe(true);
    expect(result.kind).toBe('assessment-results');
  });
});

describe('validateOscal / detectOscalDocumentKind', () => {
  it('detects root kinds', () => {
    expect(detectOscalDocumentKind(minimalSsp())).toBe('ssp');
    expect(detectOscalDocumentKind(minimalAr())).toBe('assessment-results');
    expect(detectOscalDocumentKind({ foo: 1 })).toBeNull();
  });

  it('auto-detects kind when preferred is either', () => {
    const result = validateOscal(minimalAr(), 'either');
    expect(result.valid).toBe(true);
    expect(result.kind).toBe('assessment-results');
  });
});
