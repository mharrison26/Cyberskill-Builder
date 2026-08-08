import { describe, expect, it } from 'vitest';

import {
  evaluatePoamCompleteness,
  extractPoamEntries,
  isPoamTicketType,
  isValidIsoDate,
  parsePriorFindings,
} from '@/lib/scoring/poam';
import type { ScorableTicket } from '@/lib/scoring';

function ticket(overrides: Partial<ScorableTicket> = {}): ScorableTicket {
  return {
    id: 't-poam-1',
    tenant_id: 'ten1',
    track_id: 'tr1',
    tier: 2,
    ticket_type: 'poam',
    difficulty: 'medium',
    sla_minutes: 45,
    scenario_brief: 'Draft POA&M entries for prior assessment findings.',
    initial_state: {
      prior_findings: [
        {
          id: 'FIND-AC-2-01',
          control_id: 'ac-2',
          title: 'Account Management',
          summary:
            'Privileged accounts lack documented periodic review evidence.',
        },
        {
          id: 'FIND-AU-6-01',
          control_id: 'au-6',
          title: 'Audit Record Review',
          summary: 'Security log review is ad hoc with no defined cadence.',
        },
        {
          id: 'FIND-CM-6-01',
          control_id: 'cm-6',
          title: 'Configuration Settings',
          summary: 'Baseline deviations on jump hosts are not tracked.',
        },
      ],
    },
    expected_state: {},
    dcwf_code: null,
    sort_order: 1,
    ...overrides,
  };
}

describe('poam completeness scoring', () => {
  it('parses prior findings from initial_state', () => {
    const findings = parsePriorFindings(ticket().initial_state);
    expect(findings).toHaveLength(3);
    expect(findings.map((f) => f.id)).toEqual([
      'FIND-AC-2-01',
      'FIND-AU-6-01',
      'FIND-CM-6-01',
    ]);
  });

  it('extracts snake_case and camelCase entry fields', () => {
    const entries = extractPoamEntries({
      entries: [
        {
          finding_id: 'FIND-AC-2-01',
          weakness_description: 'Privileged account reviews are missing.',
          milestone: 'Implement quarterly privileged access reviews.',
          scheduled_completion_date: '2026-10-15',
          status: 'open',
        },
      ],
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.findingId).toBe('FIND-AC-2-01');
    expect(entries[0]?.scheduledCompletionDate).toBe('2026-10-15');
  });

  it('validates ISO dates strictly', () => {
    expect(isValidIsoDate('2026-10-15')).toBe(true);
    expect(isValidIsoDate('2026-13-01')).toBe(false);
    expect(isValidIsoDate('10/15/2026')).toBe(false);
  });

  it('fails when an entry is missing for a prior finding', () => {
    const result = evaluatePoamCompleteness(
      {
        entries: [
          {
            findingId: 'FIND-AC-2-01',
            weaknessDescription:
              'Privileged account reviews are not documented.',
            milestone:
              'Stand up a quarterly privileged access review with evidence retention.',
            scheduledCompletionDate: '2026-10-15',
            status: 'open',
          },
        ],
      },
      ticket()
    );

    expect(result.ok).toBe(false);
    expect(result.structured.complete).toBe(false);
    expect(result.structured.missingFindingIds).toEqual([
      'FIND-AU-6-01',
      'FIND-CM-6-01',
    ]);
    expect(result.feedback).toContain('Missing POA&M entries');
  });

  it('fails when required fields are empty or too short', () => {
    const result = evaluatePoamCompleteness(
      {
        entries: [
          {
            findingId: 'FIND-AC-2-01',
            weaknessDescription: 'too short',
            milestone: 'also short',
            scheduledCompletionDate: '2026-10-15',
            status: 'open',
          },
          {
            findingId: 'FIND-AU-6-01',
            weaknessDescription:
              'Log review cadence is undefined for security events.',
            milestone:
              'Document and implement weekly security log review procedures.',
            scheduledCompletionDate: '2026-09-01',
            status: 'open',
          },
          {
            findingId: 'FIND-CM-6-01',
            weaknessDescription:
              'Jump host baselines are not enforced or tracked.',
            milestone:
              'Apply CIS baseline and track exceptions in the CM register.',
            scheduledCompletionDate: '2026-11-30',
            status: 'ongoing',
          },
        ],
      },
      ticket()
    );

    expect(result.ok).toBe(false);
    expect(result.structured.incompleteEntries[0]?.findingId).toBe(
      'FIND-AC-2-01'
    );
    expect(result.structured.incompleteEntries[0]?.missing).toEqual(
      expect.arrayContaining([
        'weakness_description_too_short',
        'milestone_too_short',
      ])
    );
  });

  it('passes when all prior findings have complete entries', () => {
    const result = evaluatePoamCompleteness(
      {
        entries: [
          {
            findingId: 'FIND-AC-2-01',
            weaknessDescription:
              'Privileged account reviews are not documented each quarter.',
            milestone:
              'Implement quarterly privileged access reviews with signed evidence.',
            scheduledCompletionDate: '2026-10-15',
            status: 'open',
          },
          {
            findingId: 'FIND-AU-6-01',
            weaknessDescription:
              'Security log review is ad hoc with no defined weekly cadence.',
            milestone:
              'Publish AU-6 procedures and run weekly SOC log review checklists.',
            scheduledCompletionDate: '2026-09-30',
            status: 'ongoing',
          },
          {
            findingId: 'FIND-CM-6-01',
            weaknessDescription:
              'Jump host configuration deviations are not tracked to a baseline.',
            milestone:
              'Enforce hardened baseline and open CM exceptions for approved deviations.',
            scheduledCompletionDate: '2026-12-15',
            status: 'open',
          },
        ],
      },
      ticket()
    );

    expect(result.ok).toBe(true);
    expect(result.structured.complete).toBe(true);
    expect(result.structured.missingFindingIds).toEqual([]);
    expect(result.structured.incompleteEntries).toEqual([]);
    expect(result.entries).toHaveLength(3);
  });

  it('recognizes poam ticket type aliases', () => {
    expect(isPoamTicketType('poam')).toBe(true);
    expect(isPoamTicketType('grc.poam')).toBe(true);
    expect(isPoamTicketType('poam_draft')).toBe(true);
    expect(isPoamTicketType('hybrid')).toBe(false);
  });
});
