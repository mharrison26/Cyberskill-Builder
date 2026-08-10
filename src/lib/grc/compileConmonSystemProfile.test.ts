import { describe, expect, it } from 'vitest';

import {
  buildConmonSystemProfileGapsMessage,
  extractSystemProfileFromSspPayload,
  seedSystemProfileFromInitialState,
  usesStudentConmonSystemProfile,
} from '@/lib/grc/compileConmonSystemProfile';

describe('usesStudentConmonSystemProfile', () => {
  it('detects explicit flag and sourceSystemProfile config', () => {
    expect(usesStudentConmonSystemProfile({})).toBe(false);
    expect(
      usesStudentConmonSystemProfile({ useStudentSystemProfile: true })
    ).toBe(true);
    expect(
      usesStudentConmonSystemProfile({
        systemProfileSource: 'student_grc03',
      })
    ).toBe(true);
    expect(
      usesStudentConmonSystemProfile({
        sourceSystemProfile: { mode: 'student_grc03', ticketCode: 'GRC-03' },
      })
    ).toBe(true);
  });
});

describe('extractSystemProfileFromSspPayload', () => {
  it('reads OSCAL system-characteristics from a compiled SSP', () => {
    const profile = extractSystemProfileFromSspPayload({
      'system-security-plan': {
        'system-characteristics': {
          'system-name': 'Northwind CUI Enclave',
          description:
            'Northwind CUI enclave for the DoD subcontract. Enclave boundary: isolated VPC.',
          'authorization-boundary': {
            description: 'Isolated VPC enclave that processes CUI.',
          },
        },
        'control-implementation': {
          'implemented-requirements': [
            {
              'control-id': 'r03.01.01',
              'by-components': [
                {
                  description:
                    'Accounts are provisioned through SSO with MFA for engineers and admins.',
                },
              ],
            },
          ],
        },
      },
    });

    expect(profile).toEqual(
      expect.objectContaining({
        name: 'Northwind CUI Enclave',
        description: expect.stringContaining('isolated VPC'),
        authorizationBoundary: expect.stringContaining('Isolated VPC'),
      })
    );
    expect(profile?.components?.[0]).toContain('r03.01.01');
  });

  it('reads nested scorer structured_result.ssp', () => {
    const profile = extractSystemProfileFromSspPayload({
      style: 'oscal_ssp',
      ssp: {
        'system-security-plan': {
          'system-characteristics': {
            'system-name': 'Training Lab',
            description: 'Lab system description.',
          },
        },
      },
    });
    expect(profile?.name).toBe('Training Lab');
    expect(profile?.description).toBe('Lab system description.');
  });

  it('returns null when no description is present', () => {
    expect(extractSystemProfileFromSspPayload({})).toBeNull();
    expect(extractSystemProfileFromSspPayload(null)).toBeNull();
  });
});

describe('seedSystemProfileFromInitialState / gaps message', () => {
  it('maps seeded systemProfile objects', () => {
    expect(
      seedSystemProfileFromInitialState({
        systemProfile: {
          name: 'Northwind CUI Enclave',
          description: 'Isolated VPC with SSO MFA.',
          impactLevel: 'moderate',
          controlFamilies: ['AC', 'IA'],
        },
      })
    ).toEqual(
      expect.objectContaining({
        name: 'Northwind CUI Enclave',
        impactLevel: 'moderate',
        controlFamilies: ['AC', 'IA'],
      })
    );
  });

  it('joins gap messages for empty-state UI', () => {
    expect(
      buildConmonSystemProfileGapsMessage([
        {
          key: 'grc03',
          message: 'Complete GRC-03 first.',
        },
      ])
    ).toBe('Complete GRC-03 first.');
    expect(buildConmonSystemProfileGapsMessage([])).toContain('GRC-03');
  });
});
