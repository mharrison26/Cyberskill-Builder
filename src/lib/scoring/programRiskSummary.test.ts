import { describe, expect, it } from 'vitest';

import {
  buildRiskSystemCitations,
  evaluateProgramRiskSummaryDeterministic,
  extractProgramRiskSummarySubmission,
  parseProgramCandidateRisks,
  parseProgramCandidateThemes,
  parseProgramRiskSystems,
  parseProgramRiskSummaryExpectedState,
  programRiskSummaryTicketScorer,
} from '@/lib/scoring/programRiskSummary';
import type { ScorableTicket } from '@/lib/scoring';
import { getTicketScorer, listRegisteredTicketTypes } from '@/lib/scoring';

const SYSTEMS = [
  {
    id: 'sys_hr',
    name: 'HR Portal',
    overallRating: 'high',
    risks: [
      {
        id: 'risk_priv_access',
        title: 'Excessive privileged access',
        severity: 'high',
        likelihood: 'moderate',
        score: 12,
      },
      {
        id: 'risk_patch_latency',
        title: 'Patch latency on internet-facing hosts',
        severity: 'high',
        likelihood: 'high',
        score: 16,
      },
    ],
  },
  {
    id: 'sys_pay',
    name: 'Payment API',
    overallRating: 'high',
    risks: [
      {
        id: 'risk_patch_latency',
        title: 'Patch latency on internet-facing hosts',
        severity: 'high',
        likelihood: 'high',
        score: 16,
      },
      {
        id: 'risk_logging_gaps',
        title: 'Incomplete security logging',
        severity: 'high',
        likelihood: 'moderate',
        score: 12,
      },
    ],
  },
  {
    id: 'sys_iam',
    name: 'Identity Broker',
    overallRating: 'moderate',
    risks: [
      {
        id: 'risk_priv_access',
        title: 'Excessive privileged access',
        severity: 'high',
        likelihood: 'moderate',
        score: 12,
      },
      {
        id: 'risk_logging_gaps',
        title: 'Incomplete security logging',
        severity: 'moderate',
        likelihood: 'moderate',
        score: 9,
      },
    ],
  },
];

const CANDIDATE_RISKS = [
  { id: 'risk_patch_latency', title: 'Patch latency', programWeight: 55 },
  { id: 'risk_priv_access', title: 'Privileged access', programWeight: 42 },
  { id: 'risk_logging_gaps', title: 'Logging gaps', programWeight: 38 },
  { id: 'risk_vendor_saas', title: 'Vendor SaaS', programWeight: 20 },
  {
    id: 'risk_distractor_physical',
    title: 'Physical security',
    programWeight: 8,
  },
];

const CANDIDATE_THEMES = [
  { id: 'theme_identity_access', label: 'Identity & privileged access' },
  { id: 'theme_vuln_mgmt', label: 'Vulnerability / patch management' },
  { id: 'theme_monitoring', label: 'Incomplete logging & monitoring' },
  {
    id: 'theme_distractor_facilities',
    label: 'Data center physical security',
  },
];

const TOP_RISKS = [
  'risk_patch_latency',
  'risk_priv_access',
  'risk_logging_gaps',
];

const THEMES = ['theme_identity_access', 'theme_vuln_mgmt', 'theme_monitoring'];

const GOOD_SUMMARY =
  'Across HarborForge systems, patch latency on internet-facing hosts is the ' +
  'highest program risk, followed by excessive privileged access and incomplete ' +
  'logging. Common themes are identity weaknesses, vulnerability management delays, ' +
  'and monitoring gaps that span multiple authorization boundaries.';

function ticket(overrides: Partial<ScorableTicket> = {}): ScorableTicket {
  return {
    id: 't-prs-1',
    tenant_id: 'ten1',
    track_id: 'tr-issm',
    tier: 2,
    ticket_type: 'program_risk_summary',
    difficulty: 'medium',
    sla_minutes: 40,
    scenario_brief:
      'Program risk summary: Aggregate HarborForge system risk ratings into a program rollup.',
    initial_state: {
      prompt:
        'Aggregate system risk ratings into a program-level summary. Select the top 3 program risks and common themes.',
      program: { name: 'HarborForge Enterprise', reportingPeriod: 'FY2026 Q3' },
      systems: SYSTEMS,
      candidateRisks: CANDIDATE_RISKS,
      candidateThemes: CANDIDATE_THEMES,
      topN: 3,
      minSummaryLength: 120,
    },
    expected_state: {
      topRiskIds: TOP_RISKS,
      themeIds: THEMES,
      requireExactTopRiskOrder: true,
      minSummaryLength: 120,
      passThresholdPercent: 100,
    },
    dcwf_code: '722',
    sort_order: 1,
    ...overrides,
  };
}

describe('programRiskSummary', () => {
  it('registers program_risk_summary aliases', () => {
    const registered = listRegisteredTicketTypes();
    expect(registered).toContain('program_risk_summary');
    expect(registered).toContain('aggregated_risk_summary');
    expect(registered).toContain('issm_program_risk_rollups');
    expect(getTicketScorer('aggregated_risk_summary')).toBe(
      getTicketScorer('program_risk_summary')
    );
  });

  it('parses systems, candidates, and citations without requiring UI weight', () => {
    const systems = parseProgramRiskSystems(ticket().initial_state);
    expect(systems).toHaveLength(3);
    expect(systems[0]?.risks[0]?.id).toBe('risk_priv_access');

    const risks = parseProgramCandidateRisks(ticket().initial_state);
    expect(risks).toHaveLength(5);
    expect(risks[0]?.programWeight).toBe(55);

    const themes = parseProgramCandidateThemes(ticket().initial_state);
    expect(themes).toHaveLength(4);

    const citations = buildRiskSystemCitations(systems, risks);
    const patch = citations.find((c) => c.risk.id === 'risk_patch_latency');
    expect(patch?.systemsAffected).toBe(2);
    expect(patch?.scoreSum).toBe(32);
  });

  it('parses expected state with ordered top risks and theme set', () => {
    const parsed = parseProgramRiskSummaryExpectedState({
      top_risk_ids: TOP_RISKS,
      theme_ids: [...THEMES].reverse(),
      require_exact_top_risk_order: true,
    });
    expect(parsed?.topRiskIds).toEqual(TOP_RISKS);
    expect(parsed?.themeIds).toEqual([...THEMES].sort());
    expect(parsed?.requireExactTopRiskOrder).toBe(true);
    expect(parsed?.minSummaryLength).toBe(120);
  });

  it('extracts submission fields with aliases', () => {
    const parsed = extractProgramRiskSummarySubmission({
      rankedRiskIds: TOP_RISKS,
      selectedThemeIds: THEMES,
      narrative: GOOD_SUMMARY,
    });
    expect(parsed?.topRiskIds).toEqual(TOP_RISKS);
    expect(parsed?.themeIds).toEqual(THEMES);
    expect(parsed?.summary.length).toBeGreaterThan(120);
  });

  it('fails when top risks are correct set but wrong order', () => {
    const result = evaluateProgramRiskSummaryDeterministic(
      {
        type: 'program_risk_summary',
        topRiskIds: [
          'risk_priv_access',
          'risk_patch_latency',
          'risk_logging_gaps',
        ],
        themeIds: THEMES,
        summary: GOOD_SUMMARY,
      },
      ticket()
    );
    expect(result.ok).toBe(false);
    expect(result.structured.topRisksSetMatch).toBe(true);
    expect(result.structured.topRisksOrderedMatch).toBe(false);
    expect(result.structured.reason).toBe('wrong_top_risk_order');
    expect(result.structured.wrongOrderTopRiskIds.length).toBeGreaterThan(0);
  });

  it('allows set match when requireExactTopRiskOrder is false', () => {
    const result = evaluateProgramRiskSummaryDeterministic(
      {
        topRiskIds: [
          'risk_priv_access',
          'risk_patch_latency',
          'risk_logging_gaps',
        ],
        themeIds: THEMES,
        summary: GOOD_SUMMARY,
      },
      ticket({
        expected_state: {
          topRiskIds: TOP_RISKS,
          themeIds: THEMES,
          requireExactTopRiskOrder: false,
          minSummaryLength: 120,
        },
      })
    );
    expect(result.ok).toBe(true);
    expect(result.structured.topRisksOk).toBe(true);
  });

  it('fails on theme set mismatch or short summary', () => {
    const themes = evaluateProgramRiskSummaryDeterministic(
      {
        topRiskIds: TOP_RISKS,
        themeIds: [...THEMES, 'theme_distractor_facilities'],
        summary: GOOD_SUMMARY,
      },
      ticket()
    );
    expect(themes.ok).toBe(false);
    expect(themes.structured.extraThemeIds).toContain(
      'theme_distractor_facilities'
    );

    const short = evaluateProgramRiskSummaryDeterministic(
      {
        topRiskIds: TOP_RISKS,
        themeIds: THEMES,
        summary: 'Too short.',
      },
      ticket()
    );
    expect(short.ok).toBe(false);
    expect(short.structured.reason).toBe('summary_too_short');
  });

  it('resolves when ordered top risks, themes, and summary pass', async () => {
    const scored = await programRiskSummaryTicketScorer.score(
      {
        type: 'program_risk_summary',
        topRiskIds: TOP_RISKS,
        themeIds: THEMES,
        summary: GOOD_SUMMARY,
      },
      ticket()
    );
    expect(scored.status).toBe('resolved');
    expect(scored.structuredResult.topRisksOrderedMatch).toBe(true);
    expect(scored.structuredResult.themesOk).toBe(true);
    expect(scored.structuredResult.summaryOk).toBe(true);
    expect(scored.structuredResult.percentage).toBe(100);
  });
});
