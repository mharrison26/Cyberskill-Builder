import { describe, expect, it } from 'vitest';

import {
  evaluatePoamStatusUpdateDeterministic,
  evaluateScenarioClosureEvidence,
  normalizePoamStatusUpdateStatus,
  parsePoamStatusUpdateEvidence,
  parsePoamStatusUpdateItem,
  poamStatusUpdateTicketScorer,
} from '@/lib/scoring/poamStatusUpdate';
import type { ScorableTicket } from '@/lib/scoring';
import { getTicketScorer, listRegisteredTicketTypes } from '@/lib/scoring';

function ticket(overrides: Partial<ScorableTicket> = {}): ScorableTicket {
  return {
    id: 't-poam-status-1',
    tenant_id: 'ten1',
    track_id: 'tr1',
    tier: 2,
    ticket_type: 'poam_status_update',
    difficulty: 'medium',
    sla_minutes: 40,
    scenario_brief: 'POA&M status: update mid-remediation item.',
    initial_state: {
      prompt:
        'Update the POA&M status as of 2026-03-15. Do not close without verified closure evidence.',
      asOfDate: '2026-03-15',
      poamItem: {
        id: 'POAM-AC-2-01',
        controlId: 'ac-2',
        title: 'Privileged MFA enforcement',
        weakness:
          'Privileged remote access accounts can authenticate without MFA.',
        owner: 'Jamie Torres, IAM Lead',
        scheduledCompletionDate: '2026-03-01',
        currentStatus: 'ongoing',
        milestones: [
          {
            id: 'm1',
            description: 'Select MFA vendor and approve architecture',
            dueDate: '2026-01-15',
            status: 'complete',
          },
          {
            id: 'm2',
            description: 'Enforce MFA for all privileged remote accounts',
            dueDate: '2026-02-28',
            status: 'slipped',
          },
          {
            id: 'm3',
            description: 'Independent verification / access review',
            dueDate: '2026-03-01',
            status: 'not_started',
          },
        ],
      },
      evidence: [
        {
          id: 'ev-1',
          label: 'Draft MFA rollout plan (unsigned)',
          provided: true,
          verified: false,
        },
        {
          id: 'ev-2',
          label: 'Post-implementation privileged access review',
          provided: false,
          verified: false,
        },
      ],
    },
    expected_state: {
      expectedStatus: 'delayed',
      minJustificationLength: 80,
      requireEvidenceForClosed: true,
      allowedClosedEvidenceIds: ['ev-2'],
    },
    dcwf_code: '612',
    sort_order: 2,
    ...overrides,
  };
}

const justification =
  'Milestone m2 slipped past the 2026-02-28 due date and scheduled completion (2026-03-01) is already past as of 2026-03-15; compensating controls are not verified, so the item is delayed rather than on track or closed.';

describe('poamStatusUpdate', () => {
  it('registers ticket type aliases', () => {
    const registered = listRegisteredTicketTypes();
    expect(registered).toContain('poam_status_update');
    expect(registered).toContain('poam_remediation_status');
    expect(registered).toContain('poam_midpoint_update');
    expect(getTicketScorer('poam_status_update')).toBeTruthy();
  });

  it('normalizes status aliases to on_track / delayed / closed', () => {
    expect(normalizePoamStatusUpdateStatus('ongoing')).toBe('on_track');
    expect(normalizePoamStatusUpdateStatus('completed')).toBe('closed');
    expect(normalizePoamStatusUpdateStatus('Delayed')).toBe('delayed');
  });

  it('parses POA&M item and evidence from initial_state', () => {
    const item = parsePoamStatusUpdateItem(ticket().initial_state);
    expect(item?.id).toBe('POAM-AC-2-01');
    expect(item?.milestones).toHaveLength(3);

    const evidence = parsePoamStatusUpdateEvidence(ticket().initial_state);
    expect(evidence).toHaveLength(2);
    expect(evidence[0]?.verified).toBe(false);
  });

  it('blocks closure when required evidence is missing or unverified', () => {
    const expected = {
      expectedStatus: 'delayed' as const,
      requireEvidenceForClosed: true,
      allowedClosedEvidenceIds: ['ev-2'],
    };
    const check = evaluateScenarioClosureEvidence(
      ticket().initial_state,
      expected
    );
    expect(check.allowsClosure).toBe(false);
    expect(check.missingClosureEvidenceIds).toContain('ev-2');
  });

  it('rejects closed without verified evidence (evidence-before-closure)', () => {
    const result = evaluatePoamStatusUpdateDeterministic(
      {
        type: 'poam_status_update',
        status: 'closed',
        justification,
        citedEvidenceIds: ['ev-1'],
      },
      ticket()
    );
    expect(result.ok).toBe(false);
    expect(result.structured.evidenceBeforeClosureOk).toBe(false);
    expect(result.structured.reason).toBe('evidence_before_closure');
  });

  it('rejects wrong status even with long justification', () => {
    const result = evaluatePoamStatusUpdateDeterministic(
      {
        status: 'on_track',
        justification,
      },
      ticket()
    );
    expect(result.ok).toBe(false);
    expect(result.structured.statusMatch).toBe(false);
    expect(result.structured.reason).toBe('incorrect_status');
  });

  it('rejects short justification', () => {
    const result = evaluatePoamStatusUpdateDeterministic(
      {
        status: 'delayed',
        justification: 'too short',
      },
      ticket()
    );
    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('justification_too_short');
  });

  it('resolves when status is delayed and justification meets min length', async () => {
    const scored = await poamStatusUpdateTicketScorer.score(
      {
        type: 'poam_status_update',
        status: 'delayed',
        justification,
      },
      ticket()
    );
    expect(scored.status).toBe('resolved');
    expect(scored.structuredResult.statusMatch).toBe(true);
    expect(scored.structuredResult.justificationOk).toBe(true);
  });

  it('when expected is closed, requires cited verified evidence', () => {
    const closedTicket = ticket({
      initial_state: {
        ...ticket().initial_state,
        evidence: [
          {
            id: 'ev-2',
            label: 'Post-implementation privileged access review',
            provided: true,
            verified: true,
          },
        ],
      },
      expected_state: {
        expectedStatus: 'closed',
        minJustificationLength: 80,
        requireEvidenceForClosed: true,
        allowedClosedEvidenceIds: ['ev-2'],
      },
    });

    const missingCite = evaluatePoamStatusUpdateDeterministic(
      {
        status: 'closed',
        justification,
        citedEvidenceIds: [],
      },
      closedTicket
    );
    expect(missingCite.ok).toBe(false);
    expect(missingCite.structured.reason).toBe('evidence_before_closure');

    const withCite = evaluatePoamStatusUpdateDeterministic(
      {
        status: 'closed',
        justification,
        citedEvidenceIds: ['ev-2'],
      },
      closedTicket
    );
    expect(withCite.ok).toBe(true);
  });
});
