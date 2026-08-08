import { describe, expect, it } from 'vitest';

import { parseSourceArtifactsFromTicketState } from '@/lib/capstone/compilePackage';
import {
  DEFAULT_CAPSTONE_SOURCE_ARTIFACTS,
  GRC_TICKET_CODES,
  isAoReviewTicketType,
  isAuthorizationPackageTicketType,
} from '@/lib/capstone/ticketCodes';
import { buildDeterministicAoQuestions } from '@/lib/capstone/generateAoQuestions';
import type { CompiledAuthorizationPackage } from '@/lib/capstone/compilePackage';

describe('capstone ticket codes', () => {
  it('recognizes authorization_package and ao_review types', () => {
    expect(isAuthorizationPackageTicketType('authorization_package')).toBe(
      true
    );
    expect(isAuthorizationPackageTicketType('grc.authorization_package')).toBe(
      true
    );
    expect(isAoReviewTicketType('ao_review')).toBe(true);
    expect(isAoReviewTicketType('poam')).toBe(false);
  });

  it('documents default GRC-03/04/09 sources', () => {
    expect(DEFAULT_CAPSTONE_SOURCE_ARTIFACTS.map((s) => s.code)).toEqual([
      GRC_TICKET_CODES.SSP,
      GRC_TICKET_CODES.POAM,
      GRC_TICKET_CODES.OSCAL_GENERATOR,
    ]);
  });
});

describe('parseSourceArtifactsFromTicketState', () => {
  it('falls back to defaults when unset', () => {
    const sources = parseSourceArtifactsFromTicketState({});
    expect(sources).toHaveLength(3);
    expect(sources[0]?.ticketTypes).toContain('oscal_ssp');
  });

  it('honors explicit sourceArtifacts in initial_state', () => {
    const sources = parseSourceArtifactsFromTicketState({
      ticketCode: 'GRC-10',
      sourceArtifacts: [
        {
          code: 'GRC-03',
          ticketTypes: ['oscal_ssp'],
          label: 'Custom SSP',
        },
      ],
    });
    expect(sources).toHaveLength(1);
    expect(sources[0]?.label).toBe('Custom SSP');
  });
});

describe('buildDeterministicAoQuestions', () => {
  it('builds 5–7 package-specific questions', () => {
    const pkg: CompiledAuthorizationPackage = {
      trackId: 'track-1',
      studentId: 'student-1',
      complete: false,
      missingCodes: [GRC_TICKET_CODES.OSCAL_GENERATOR],
      compiledAt: new Date().toISOString(),
      artifacts: [
        {
          code: GRC_TICKET_CODES.SSP,
          label: 'SSP fragment (OSCAL)',
          ticketTypes: ['oscal_ssp'],
          status: 'present',
          ticketId: 't1',
          progressStatus: 'resolved',
          summary: 'SSP artifact keys: system-security-plan.',
          payload: { 'system-security-plan': { uuid: 'x' } },
          textCorpus: '## GRC-03\n{"ssp":true}',
        },
        {
          code: GRC_TICKET_CODES.POAM,
          label: 'POA&M entries',
          ticketTypes: ['poam'],
          status: 'present',
          ticketId: 't2',
          progressStatus: 'resolved',
          summary: '1 POA&M entry available.',
          payload: {
            poamItems: [
              {
                finding_id: 'FIND-1',
                weakness_description:
                  'Privileged accounts lack MFA on the remote admin path.',
                milestone: 'Enforce MFA for all privileged remote access.',
                scheduled_completion_date: '2026-09-01',
                status: 'open',
              },
            ],
            entries: [],
          },
          textCorpus: '## GRC-04\npoam',
        },
        {
          code: GRC_TICKET_CODES.OSCAL_GENERATOR,
          label: 'OSCAL generator artifacts',
          ticketTypes: ['oscal_generator'],
          status: 'missing',
          ticketId: null,
          progressStatus: null,
          summary: 'No OSCAL generator submission found.',
          payload: null,
          textCorpus: '',
        },
      ],
    };

    const questions = buildDeterministicAoQuestions(pkg);
    expect(questions.length).toBeGreaterThanOrEqual(5);
    expect(questions.length).toBeLessThanOrEqual(7);
    expect(
      questions.some((q) => q.prompt.includes('Privileged accounts'))
    ).toBe(true);
    expect(questions.some((q) => q.prompt.includes('GRC-09'))).toBe(true);
  });
});
