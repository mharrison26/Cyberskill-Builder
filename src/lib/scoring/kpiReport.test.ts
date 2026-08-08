import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  computeHelpdeskKpis,
  computeKpisFromCsv,
  parseResolvedTicketsCsv,
} from '@/lib/helpdesk/kpiMetrics';
import type { ScorableTicket } from '@/lib/scoring';
import {
  evaluateKpiReportDeterministic,
  extractKpiReportSubmission,
  kpiReportTicketScorer,
} from '@/lib/scoring/kpiReport';

const SAMPLE_CSV = readFileSync(
  resolve(process.cwd(), 'data/helpdesk/resolved-tickets.csv'),
  'utf8'
);

const EXPECTED = {
  averageResolutionHours: 7.27,
  medianResolutionHours: 3.5,
  slaCompliancePercent: 83,
  volumeByCategory: {
    access: 18,
    hardware: 12,
    software: 15,
    network: 10,
    email: 9,
    account: 8,
  },
};

function ticket(overrides: Partial<ScorableTicket> = {}): ScorableTicket {
  return {
    id: 't-kpi',
    tenant_id: 'ten1',
    track_id: 'tr1',
    tier: 1,
    ticket_type: 'kpi_report',
    difficulty: 'medium',
    sla_minutes: 45,
    scenario_brief: 'Compute helpdesk KPIs from the resolved-ticket CSV.',
    initial_state: {
      csv: SAMPLE_CSV,
      ticketCode: 'HD-05',
    },
    expected_state: {
      ...EXPECTED,
      minReportLength: 80,
      reportKeywords: ['sla', 'resolution', 'category'],
    },
    dcwf_code: null,
    sort_order: 0,
    ...overrides,
  };
}

const GOOD_REPORT =
  'Average resolution is about 7.27 hours. SLA compliance is 83%. ' +
  'Volume by category shows access as the highest ticket category, ' +
  'followed by software and hardware. Median resolution is 3.5 hours, ' +
  'so the mean is pulled up by longer tail tickets.';

describe('parseResolvedTicketsCsv / computeHelpdeskKpis', () => {
  it('parses 72 rows and computes known KPIs', () => {
    const rows = parseResolvedTicketsCsv(SAMPLE_CSV);
    expect(rows).toHaveLength(72);

    const kpis = computeHelpdeskKpis(rows);
    expect(kpis.averageResolutionHours).toBe(EXPECTED.averageResolutionHours);
    expect(kpis.medianResolutionHours).toBe(EXPECTED.medianResolutionHours);
    expect(kpis.slaCompliancePercent).toBe(EXPECTED.slaCompliancePercent);
    expect(kpis.volumeByCategory).toEqual(EXPECTED.volumeByCategory);
  });

  it('computeKpisFromCsv matches helper pipeline', () => {
    expect(computeKpisFromCsv(SAMPLE_CSV)).toMatchObject(EXPECTED);
  });
});

describe('extractKpiReportSubmission', () => {
  it('accepts manual form fields', () => {
    const parsed = extractKpiReportSubmission({
      type: 'kpi_report',
      mode: 'manual',
      averageResolutionHours: 7.27,
      slaCompliancePercent: 83,
      medianResolutionHours: 3.5,
      volumeByCategory: EXPECTED.volumeByCategory,
      report: GOOD_REPORT,
    });
    expect(parsed).toMatchObject({
      mode: 'manual',
      averageResolutionHours: 7.27,
      slaCompliancePercent: 83,
    });
  });

  it('accepts script sandbox files', () => {
    const parsed = extractKpiReportSubmission({
      files: {
        'output/kpis.json': JSON.stringify({
          averageResolutionHours: 7.27,
          slaCompliancePercent: 83,
          medianResolutionHours: 3.5,
          volumeByCategory: EXPECTED.volumeByCategory,
        }),
        'report.md': GOOD_REPORT,
      },
    });
    expect(parsed?.mode).toBe('script');
    expect(parsed?.averageResolutionHours).toBe(7.27);
    expect(parsed?.report).toContain('SLA compliance');
  });

  it('parses volume strings', () => {
    const parsed = extractKpiReportSubmission({
      averageResolutionHours: '7.27',
      slaCompliancePercent: '83%',
      volumeByCategory: 'access:18, hardware:12, software:15, network:10, email:9, account:8',
      report: GOOD_REPORT,
    });
    expect(parsed?.volumeByCategory).toEqual(EXPECTED.volumeByCategory);
  });
});

describe('evaluateKpiReportDeterministic', () => {
  it('resolves a correct manual submission', () => {
    const result = evaluateKpiReportDeterministic(
      {
        mode: 'manual',
        averageResolutionHours: 7.27,
        slaCompliancePercent: 83,
        medianResolutionHours: 3.5,
        volumeByCategory: EXPECTED.volumeByCategory,
        report: GOOD_REPORT,
      },
      ticket()
    );
    expect(result.ok).toBe(true);
    expect(result.structured.matchedCount).toBe(4);
  });

  it('allows average within hours tolerance', () => {
    const result = evaluateKpiReportDeterministic(
      {
        averageResolutionHours: 7.3,
        slaCompliancePercent: 83,
        medianResolutionHours: 3.5,
        volumeByCategory: EXPECTED.volumeByCategory,
        report: GOOD_REPORT,
      },
      ticket()
    );
    expect(result.ok).toBe(true);
  });

  it('rejects wrong category volume', () => {
    const result = evaluateKpiReportDeterministic(
      {
        averageResolutionHours: 7.27,
        slaCompliancePercent: 83,
        medianResolutionHours: 3.5,
        volumeByCategory: { ...EXPECTED.volumeByCategory, access: 17 },
        report: GOOD_REPORT,
      },
      ticket()
    );
    expect(result.ok).toBe(false);
    expect(result.structured.matches.find((m) => m.field === 'volumeByCategory')?.matched).toBe(
      false
    );
  });

  it('rejects a too-short report', () => {
    const result = evaluateKpiReportDeterministic(
      {
        averageResolutionHours: 7.27,
        slaCompliancePercent: 83,
        medianResolutionHours: 3.5,
        volumeByCategory: EXPECTED.volumeByCategory,
        report: 'too short',
      },
      ticket()
    );
    expect(result.ok).toBe(false);
    expect(result.structured.reportOk).toBe(false);
  });

  it('recomputes expected KPIs from CSV when expected_state omits them', () => {
    const result = evaluateKpiReportDeterministic(
      {
        averageResolutionHours: 7.27,
        slaCompliancePercent: 83,
        medianResolutionHours: 3.5,
        volumeByCategory: EXPECTED.volumeByCategory,
        report: GOOD_REPORT,
      },
      ticket({ expected_state: { minReportLength: 80 } })
    );
    expect(result.ok).toBe(true);
  });
});

describe('kpiReportTicketScorer', () => {
  it('marks correct script submission resolved', async () => {
    const result = await kpiReportTicketScorer.score(
      {
        files: {
          'output/kpis.json': JSON.stringify({
            average_resolution_hours: 7.27,
            sla_compliance_percent: 83,
            median_resolution_hours: 3.5,
            volume_by_category: EXPECTED.volumeByCategory,
          }),
          'report.md': GOOD_REPORT,
        },
      },
      ticket()
    );
    expect(result.status).toBe('resolved');
    expect(result.structuredResult).toMatchObject({ style: 'kpi_report' });
  });
});
