import { describe, expect, it } from 'vitest';

import type { CompiledAuthorizationPackage } from '@/lib/capstone/compilePackage';
import {
  GRC_TICKET_CODES,
  isSecurityAssessmentReportTicketType,
} from '@/lib/capstone/ticketCodes';
import type { ScorableTicket } from '@/lib/scoring';
import {
  createSecurityAssessmentReportTicketScorer,
  evaluateSecurityAssessmentReportDeterministic,
  extractPoamRefsFromPayload,
  extractSarSummary,
  extractSeedSarPriors,
  mergeSarPriors,
  sarMentionsPoamRef,
  SAR_MIN_SUMMARY_LENGTH,
} from '@/lib/scoring/securityAssessmentReport';

function ticket(
  overrides?: Partial<ScorableTicket>
): ScorableTicket {
  return {
    id: 't-sar',
    tenant_id: 'ten1',
    track_id: 'tr1',
    tier: 2,
    ticket_type: 'security_assessment_report',
    difficulty: 'medium',
    sla_minutes: 45,
    scenario_brief: 'SAR: Draft a short security assessment report summary',
    initial_state: {
      ticketCode: 'GRC-05',
      sspFragment: {
        systemName: 'Training Lab Information System',
        sspTitle: 'Student SSP fragment',
      },
      poamEntries: [
        {
          findingId: 'FIND-AC-2-01',
          title: 'Account Management',
          weaknessDescription:
            'Privileged accounts lack documented quarterly review evidence.',
        },
        {
          findingId: 'FIND-AU-6-01',
          title: 'Audit Record Review',
          weaknessDescription:
            'Security log review is ad hoc with no defined cadence.',
        },
      ],
    },
    expected_state: { minSummaryLength: SAR_MIN_SUMMARY_LENGTH },
    dcwf_code: '612',
    sort_order: 30,
    ...overrides,
  };
}

function livePkg(): CompiledAuthorizationPackage {
  return {
    trackId: 'tr1',
    studentId: 'stu1',
    complete: true,
    missingCodes: [],
    compiledAt: new Date().toISOString(),
    artifacts: [
      {
        code: GRC_TICKET_CODES.SSP,
        label: 'SSP',
        ticketTypes: ['oscal_ssp'],
        status: 'present',
        ticketId: 'a',
        progressStatus: 'resolved',
        summary: 'ok',
        payload: { systemName: 'HarborForge Boundary System' },
        textCorpus: 'ssp',
      },
      {
        code: GRC_TICKET_CODES.POAM,
        label: 'POAM',
        ticketTypes: ['poam'],
        status: 'present',
        ticketId: 'b',
        progressStatus: 'resolved',
        summary: 'ok',
        payload: {
          entries: [
            {
              findingId: 'FIND-CM-6-01',
              weaknessDescription:
                'Jump host configuration deviations from the approved baseline.',
            },
          ],
          poamItems: [],
        },
        textCorpus: 'poam',
      },
    ],
  };
}

const goodSeedSar = [
  'Security Assessment Report for the Training Lab Information System.',
  'Assessment identified FIND-AC-2-01 (Account Management): privileged accounts',
  'lack documented quarterly review evidence.',
  'FIND-AU-6-01 Audit Record Review remains open: security log review is ad hoc',
  'with no defined cadence. Residual risk is tracked in the POA&M.',
].join(' ');

describe('security assessment report helpers', () => {
  it('recognizes ticket type aliases', () => {
    expect(isSecurityAssessmentReportTicketType('security_assessment_report')).toBe(
      true
    );
    expect(isSecurityAssessmentReportTicketType('grc.sar_summary')).toBe(true);
    expect(isSecurityAssessmentReportTicketType('poam')).toBe(false);
  });

  it('extracts SAR summary from common submission shapes', () => {
    expect(extractSarSummary({ sarSummary: '  hello  ' })).toBe('hello');
    expect(extractSarSummary({ summary: 'via summary' })).toBe('via summary');
    expect(extractSarSummary({})).toBe('');
  });

  it('reads seed sspFragment and poamEntries from initial_state', () => {
    const seed = extractSeedSarPriors(ticket().initial_state);
    expect(seed.sspPayload?.systemName).toBe('Training Lab Information System');
    expect(seed.poamRefs.map((r) => r.findingId)).toEqual([
      'FIND-AC-2-01',
      'FIND-AU-6-01',
    ]);
  });

  it('prefers live package artifacts over seed', () => {
    const merged = mergeSarPriors(livePkg(), ticket().initial_state);
    expect(merged.sspSource).toBe('live');
    expect(merged.poamSource).toBe('live');
    expect(merged.sspPayload?.systemName).toBe('HarborForge Boundary System');
    expect(merged.poamRefs[0]?.findingId).toBe('FIND-CM-6-01');
  });

  it('matches POA&M refs by id or title', () => {
    expect(
      sarMentionsPoamRef('Discussed FIND-AC-2-01 in depth.', {
        findingId: 'FIND-AC-2-01',
      })
    ).toBe(true);
    expect(
      sarMentionsPoamRef('Account Management remains weak.', {
        findingId: 'FIND-AC-2-01',
        title: 'Account Management',
      })
    ).toBe(true);
    expect(
      sarMentionsPoamRef('No relevant content.', {
        findingId: 'FIND-AC-2-01',
        title: 'Account Management',
      })
    ).toBe(false);
  });

  it('extracts refs from poamItems snake_case rows', () => {
    const refs = extractPoamRefsFromPayload({
      poamItems: [
        {
          finding_id: 'FIND-1',
          weakness_description: 'Weak MFA on remote admin.',
        },
      ],
    });
    expect(refs).toEqual([
      {
        findingId: 'FIND-1',
        title: undefined,
        weaknessDescription: 'Weak MFA on remote admin.',
      },
    ]);
  });
});

describe('evaluateSecurityAssessmentReportDeterministic', () => {
  it('resolves when seed priors + consistent SAR are present', () => {
    const priors = mergeSarPriors(null, ticket().initial_state);
    const result = evaluateSecurityAssessmentReportDeterministic(
      { sarSummary: goodSeedSar },
      ticket(),
      priors
    );
    expect(result.ok).toBe(true);
    expect(result.structured.artifactsComplete).toBe(true);
    expect(result.structured.consistencyOk).toBe(true);
    expect(result.structured.sspAligned).toBe(true);
    expect(result.structured.artifactSource).toBe('seed');
  });

  it('rejects short SAR and uncovered POA&M ids', () => {
    const priors = mergeSarPriors(null, ticket().initial_state);
    const short = evaluateSecurityAssessmentReportDeterministic(
      { sarSummary: 'Too short.' },
      ticket(),
      priors
    );
    expect(short.ok).toBe(false);
    expect(short.structured.reason).toBe('sar_too_short');

    const mismatch = evaluateSecurityAssessmentReportDeterministic(
      {
        sarSummary: `${'x'.repeat(SAR_MIN_SUMMARY_LENGTH)} FIND-AC-2-01 only covered.`,
      },
      ticket(),
      priors
    );
    expect(mismatch.ok).toBe(false);
    expect(mismatch.structured.reason).toBe('poam_sar_mismatch');
    expect(mismatch.structured.uncoveredPoamIds).toContain('FIND-AU-6-01');
  });

  it('rejects missing SSP / POA&M priors', () => {
    const emptyPriors = mergeSarPriors(null, {});
    const result = evaluateSecurityAssessmentReportDeterministic(
      { sarSummary: goodSeedSar },
      ticket({ initial_state: {} }),
      emptyPriors
    );
    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('missing_ssp');
  });
});

describe('createSecurityAssessmentReportTicketScorer', () => {
  it('scores with injected compile using live artifacts', async () => {
    const scorer = createSecurityAssessmentReportTicketScorer(async () =>
      livePkg()
    );
    const sar = [
      'SAR for HarborForge Boundary System.',
      'Finding FIND-CM-6-01: Jump host configuration deviations from the approved',
      'baseline remain open and are tracked for remediation in the POA&M.',
      'Residual risk is accepted pending baseline enforcement.',
    ].join(' ');

    const ok = await scorer.score({ sarSummary: sar }, ticket());
    expect(ok.status).toBe('resolved');
    expect(ok.structuredResult.artifactSource).toBe('live');
    expect(ok.structuredResult.consistencyOk).toBe(true);
  });

  it('falls back to seed when compile yields empty artifacts', async () => {
    const scorer = createSecurityAssessmentReportTicketScorer(async () => ({
      trackId: 'tr1',
      studentId: 'stu1',
      complete: false,
      missingCodes: [GRC_TICKET_CODES.SSP, GRC_TICKET_CODES.POAM],
      compiledAt: new Date().toISOString(),
      artifacts: [],
    }));

    const ok = await scorer.score({ sarSummary: goodSeedSar }, ticket());
    expect(ok.status).toBe('resolved');
    expect(ok.structuredResult.artifactSource).toBe('seed');
  });
});
