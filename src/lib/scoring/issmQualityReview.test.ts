import { describe, expect, it } from 'vitest';

import {
  evaluateIssmQualityReviewDeterministic,
  extractIssmQualityReviewSubmission,
  issmQualityReviewTicketScorer,
  parseIssmQualityArtifact,
  parseIssmQualityCandidateIssues,
  parseIssmQualityReviewExpectedState,
} from '@/lib/scoring/issmQualityReview';
import type { ScorableTicket } from '@/lib/scoring';
import { getTicketScorer, listRegisteredTicketTypes } from '@/lib/scoring';

const CANDIDATES = [
  {
    id: 'vague_language',
    label: 'Planned action uses vague / non-enforceable language',
  },
  {
    id: 'unrealistic_milestone',
    label: 'Milestone / completion date is unrealistic for the remediation',
  },
  {
    id: 'missing_owner',
    label: 'Remediation owner / POC is missing or marked TBD',
  },
  {
    id: 'distractor_missing_ato',
    label: 'POA&M entry is invalid because it omits the current ATO package ID',
  },
  {
    id: 'distractor_severity_wrong',
    label: 'Severity is incorrectly marked High and should be Low',
  },
];

const CORRECT = ['vague_language', 'unrealistic_milestone', 'missing_owner'];

function ticket(overrides: Partial<ScorableTicket> = {}): ScorableTicket {
  return {
    id: 't-issm-qr-1',
    tenant_id: 'ten1',
    track_id: 'tr-issm',
    tier: 2,
    ticket_type: 'issm_quality_review',
    difficulty: 'medium',
    sla_minutes: 40,
    scenario_brief:
      'ISSM quality review: HarborLedger POA&M entry has vague remediation and an unrealistic milestone.',
    initial_state: {
      prompt:
        'As ISSM, review the ISSO POA&M submission, select every quality issue, and draft feedback.',
      role: 'ISSM',
      artifactType: 'poam_entry',
      minFeedbackLength: 150,
      system: {
        name: 'HarborLedger Financial Reporting',
        fismaId: 'HL-FIN-2026',
      },
      isso: { name: 'Asha Patel', title: 'ISSO' },
      artifact: {
        title: 'POA&M-HL-014 — Privileged MFA enforcement gap',
        controlId: 'IA-2',
        severity: 'High',
        weakness:
          'Phishing-resistant MFA is not enforced for several privileged finance-admin roles that authenticate via the enterprise IdP.',
        plannedAction:
          'Work with IT to improve security posture as appropriate and update related documentation when feasible.',
        milestoneDate: '2026-08-12',
        owner: 'TBD',
        resources:
          'Identity Shared Services engineering + enterprise CAB window',
        residualRisk:
          'Residual risk is acceptable until the improvement is completed.',
        body: 'Submitted by ISSO Patel for ISSM quality review prior to inclusion in the authorization package POA&M register.',
      },
      candidateIssues: CANDIDATES,
    },
    expected_state: {
      issueIds: CORRECT,
      minFeedbackLength: 150,
    },
    dcwf_code: '722',
    sort_order: 1,
    ...overrides,
  };
}

const goodFeedback =
  'Asha — please revise POA&M-HL-014 before I accept it into the enterprise register. ' +
  'The planned action is not enforceable ("improve security as appropriate"); rewrite with concrete ' +
  'Conditional Access / MFA control changes, owners, and verification evidence. The 2026-08-12 ' +
  'milestone is not credible for a tenant-wide IdP change that needs CAB and Shared Services time. ' +
  'Also assign a named remediation owner instead of TBD.';

describe('issmQualityReview', () => {
  it('registers issm_quality_review aliases', () => {
    const registered = listRegisteredTicketTypes();
    expect(registered).toContain('issm_quality_review');
    expect(registered).toContain('isso_artifact_review');
    expect(registered).toContain('issm_ssp_poam_feedback');
    expect(getTicketScorer('isso_artifact_review')).toBe(
      getTicketScorer('issm_quality_review')
    );
  });

  it('parses artifact and candidate issues from initial_state', () => {
    const artifact = parseIssmQualityArtifact(ticket().initial_state);
    expect(artifact?.plannedAction).toMatch(/as appropriate/i);
    expect(artifact?.milestoneDate).toBe('2026-08-12');
    expect(artifact?.owner).toBe('TBD');

    const issues = parseIssmQualityCandidateIssues(ticket().initial_state);
    expect(issues).toHaveLength(5);
    expect(issues[0]?.id).toBe('vague_language');
  });

  it('parses expected issueIds with aliases and defaults min length', () => {
    const parsed = parseIssmQualityReviewExpectedState({
      requiredIssueIds: ['vague_language', 'unrealistic_milestone'],
    });
    expect(parsed?.issueIds).toEqual([
      'unrealistic_milestone',
      'vague_language',
    ]);
    expect(parsed?.minFeedbackLength).toBe(150);
  });

  it('extracts submission with snake_case aliases', () => {
    const parsed = extractIssmQualityReviewSubmission({
      selected_issue_ids: ['vague_language'],
      feedback_draft: '  short note  ',
    });
    expect(parsed).toEqual({
      type: 'issm_quality_review',
      issueIds: ['vague_language'],
      feedback: 'short note',
    });
  });

  it('rejects wrong issue set with missing and extra ids', () => {
    const result = evaluateIssmQualityReviewDeterministic(
      {
        type: 'issm_quality_review',
        issueIds: ['vague_language', 'distractor_missing_ato'],
        feedback: goodFeedback,
      },
      ticket()
    );
    expect(result.ok).toBe(false);
    expect(result.structured.issueSetMatch).toBe(false);
    expect(result.structured.missingIssueIds).toEqual([
      'missing_owner',
      'unrealistic_milestone',
    ]);
    expect(result.structured.extraIssueIds).toEqual(['distractor_missing_ato']);
    expect(result.structured.reason).toBe('missing_issues');
  });

  it('rejects correct issues when feedback is too short', () => {
    const result = evaluateIssmQualityReviewDeterministic(
      {
        issueIds: CORRECT,
        feedback: 'Please fix the vague language and date.',
      },
      ticket()
    );
    expect(result.ok).toBe(false);
    expect(result.structured.issueSetMatch).toBe(true);
    expect(result.structured.feedbackLengthOk).toBe(false);
    expect(result.structured.reason).toBe('feedback_too_short');
  });

  it('rejects unknown issue ids', () => {
    const result = evaluateIssmQualityReviewDeterministic(
      {
        issueIds: ['vague_language', 'not_a_real_issue'],
        feedback: goodFeedback,
      },
      ticket()
    );
    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('unknown_issue_ids');
  });

  it('resolves on exact issue set (order independent) + sufficient feedback', async () => {
    const scored = await issmQualityReviewTicketScorer.score(
      {
        type: 'issm_quality_review',
        issueIds: ['missing_owner', 'vague_language', 'unrealistic_milestone'],
        feedback: goodFeedback,
      },
      ticket()
    );
    expect(scored.status).toBe('resolved');
    expect(scored.structuredResult.issueSetMatch).toBe(true);
    expect(scored.structuredResult.feedbackLengthOk).toBe(true);
    expect(scored.structuredResult.missingIssueIds).toEqual([]);
    expect(scored.structuredResult.extraIssueIds).toEqual([]);
  });

  it('returns needs_revision when only distractors are selected', async () => {
    const scored = await issmQualityReviewTicketScorer.score(
      {
        issueIds: ['distractor_missing_ato', 'distractor_severity_wrong'],
        feedback: goodFeedback,
      },
      ticket()
    );
    expect(scored.status).toBe('needs_revision');
    expect(scored.structuredResult.issueSetMatch).toBe(false);
  });
});
