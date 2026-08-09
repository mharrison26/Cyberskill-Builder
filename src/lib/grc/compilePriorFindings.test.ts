import { describe, expect, it } from 'vitest';

import {
  compileSeedPriorFindings,
  formatPriorFindingsNarrative,
} from '@/lib/grc/compilePriorFindings';
import { isFlagshipEligibleTicketType } from '@/lib/helpdesk/ticketCodes';
import { isAuditCommitteeBriefTicketType } from '@/lib/grc/ticketCodes';

describe('compileSeedPriorFindings (flagship helper)', () => {
  it('returns empty package when no seed findings', () => {
    const pkg = compileSeedPriorFindings({});
    expect(pkg.source).toBe('empty');
    expect(pkg.findings).toEqual([]);
    expect(formatPriorFindingsNarrative(pkg.findings)).toMatch(/No prior/);
  });

  it('maps prior_findings seed payload for standalone AUD-07', () => {
    const pkg = compileSeedPriorFindings({
      ticketCode: 'AUD-07',
      sourceTicketTypes: ['findings_summary', 'cccer'],
      prior_findings: [
        {
          id: 'F-01',
          controlId: 'AC-2',
          title: 'Access revocation lag',
          summary: '6 of 15 terminations missed the SLA.',
        },
      ],
    });

    expect(pkg.source).toBe('seed');
    expect(pkg.sourceTicketTypes).toEqual(['findings_summary', 'cccer']);
    expect(pkg.findings).toHaveLength(1);
    expect(pkg.findings[0]).toMatchObject({
      id: 'F-01',
      controlId: 'AC-2',
      source: 'seed',
      ticketCode: 'AUD-06',
    });
    expect(pkg.narrative).toContain('Access revocation lag');
  });
});

describe('AUD-07 flagship eligibility helper', () => {
  it('marks audit_committee_brief as flagship-eligible', () => {
    expect(isAuditCommitteeBriefTicketType('audit_committee_brief')).toBe(
      true
    );
    expect(isFlagshipEligibleTicketType('audit_committee_brief')).toBe(true);
    expect(isFlagshipEligibleTicketType('executive_summary_ac')).toBe(true);
  });
});
