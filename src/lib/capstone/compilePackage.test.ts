import { describe, expect, it } from 'vitest';

import {
  compileSeedAuthorizationPackage,
  mergeLivePackageWithSeed,
  parseSeedPackageFromTicketState,
  parseSourceArtifactsFromTicketState,
  type CompiledAuthorizationPackage,
} from '@/lib/capstone/compilePackage';
import {
  DEFAULT_CAPSTONE_SOURCE_ARTIFACTS,
  DEFAULT_SAR_SOURCE_ARTIFACTS,
  GRC_TICKET_CODES,
  ISSO_TICKET_CODES,
  isAoReviewTicketCode,
  isAoReviewTicketType,
  isAuthorizationPackageTicketCode,
  isAuthorizationPackageTicketType,
  isSecurityAssessmentReportTicketType,
} from '@/lib/capstone/ticketCodes';
import { buildDeterministicAoQuestions } from '@/lib/capstone/generateAoQuestions';

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

  it('documents ISSO-04/ISSO-05 aliases for package + flagship AO review', () => {
    expect(ISSO_TICKET_CODES.AUTHORIZATION_PACKAGE).toBe('ISSO-04');
    expect(ISSO_TICKET_CODES.AO_REVIEW).toBe('ISSO-05');
    expect(isAuthorizationPackageTicketCode('ISSO-04')).toBe(true);
    expect(isAoReviewTicketCode('ISSO-05')).toBe(true);
    // Sheet GRC-10 is ao_review (RMF package defense); GRC-11 remains a legacy alias.
    expect(isAoReviewTicketCode('GRC-10')).toBe(true);
    expect(isAoReviewTicketCode('GRC-11')).toBe(true);
  });

  it('recognizes security_assessment_report / sar_summary (GRC-05)', () => {
    expect(
      isSecurityAssessmentReportTicketType('security_assessment_report')
    ).toBe(true);
    expect(isSecurityAssessmentReportTicketType('sar_summary')).toBe(true);
    expect(DEFAULT_SAR_SOURCE_ARTIFACTS.map((s) => s.code)).toEqual([
      GRC_TICKET_CODES.SSP,
      GRC_TICKET_CODES.POAM,
    ]);
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

describe('seedPackage fallback (ISSO-04 preview)', () => {
  const seedState = {
    ticketCode: 'ISSO-05',
    seedPackage: {
      artifacts: [
        {
          code: 'GRC-03',
          label: 'SSP fragment',
          status: 'present',
          summary: 'Seeded SSP',
          payload: { systemName: 'Harbor Dental' },
          textCorpus: 'Seeded SSP with AC-2 MFA gap',
        },
        {
          code: 'GRC-04',
          label: 'POA&M',
          status: 'present',
          summary: 'Seeded POA&M',
          payload: {
            poamItems: [
              {
                weakness_description: 'Privileged accounts lack MFA',
                status: 'open',
              },
            ],
          },
          textCorpus: 'Seeded POA&M MFA weakness',
        },
      ],
    },
  };

  it('parses seedPackage from initial_state', () => {
    const artifacts = parseSeedPackageFromTicketState(seedState);
    expect(artifacts).toHaveLength(2);
    expect(artifacts[0]?.code).toBe(GRC_TICKET_CODES.SSP);
    expect(artifacts[0]?.status).toBe('present');
  });

  it('compileSeedAuthorizationPackage builds a playable seed package', () => {
    const pkg = compileSeedAuthorizationPackage(seedState);
    expect(pkg.packageSource).toBe('seed');
    expect(pkg.complete).toBe(true);
    expect(pkg.artifacts.some((a) => a.textCorpus.includes('MFA'))).toBe(true);
  });

  it('prefers live artifacts and fills gaps from seed', () => {
    const live: CompiledAuthorizationPackage = {
      trackId: 't',
      studentId: 's',
      complete: false,
      missingCodes: [GRC_TICKET_CODES.POAM],
      compiledAt: new Date().toISOString(),
      packageSource: 'empty',
      artifacts: [
        {
          code: GRC_TICKET_CODES.SSP,
          label: 'SSP',
          ticketTypes: ['oscal_ssp'],
          status: 'present',
          ticketId: 'live-ssp',
          progressStatus: 'resolved',
          summary: 'Live SSP',
          payload: { live: true },
          textCorpus: 'Live student SSP',
        },
        {
          code: GRC_TICKET_CODES.POAM,
          label: 'POA&M',
          ticketTypes: ['poam'],
          status: 'missing',
          ticketId: null,
          progressStatus: null,
          summary: 'Missing',
          payload: null,
          textCorpus: '',
        },
      ],
    };

    const merged = mergeLivePackageWithSeed(
      live,
      parseSeedPackageFromTicketState(seedState)
    );
    expect(merged.packageSource).toBe('mixed');
    expect(merged.artifacts.find((a) => a.code === 'GRC-03')?.textCorpus).toBe(
      'Live student SSP'
    );
    expect(merged.artifacts.find((a) => a.code === 'GRC-04')?.status).toBe(
      'present'
    );
    expect(merged.artifacts.find((a) => a.code === 'GRC-04')?.summary).toMatch(
      /seeded/i
    );
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
      packageSource: 'prior_submission',
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
