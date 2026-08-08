import { describe, expect, it } from 'vitest';

import type { ScorableTicket } from '@/lib/scoring';
import { getTicketScorer, listRegisteredTicketTypes } from '@/lib/scoring';
import {
  evaluateFsPermissionsLab,
  extractFsPermissionsLabSubmission,
  normalizeFsAnswer,
  parseFsPermissionsLabExpectedState,
  parseFsPermissionsLabQuestions,
} from '@/lib/scoring/fsPermissionsLab';

function ticket(overrides: Partial<ScorableTicket> = {}): ScorableTicket {
  return {
    id: 't-fs-lab-1',
    tenant_id: 'ten1',
    track_id: 'tr1',
    tier: 1,
    ticket_type: 'fs_permissions_lab',
    difficulty: 'medium',
    sla_minutes: 25,
    scenario_brief: 'Explore the seeded filesystem and answer the questions.',
    initial_state: {
      prompt: 'Use ls -l in the sandbox.',
      questions: [
        {
          id: 'secret_mode',
          prompt: 'Octal mode of etc/secrets/api.key?',
        },
        {
          id: 'world_writable',
          prompt: 'Which tmp file is world-writable?',
        },
        {
          id: 'hidden_flag',
          prompt: 'Contents of home/analyst/.flag?',
        },
      ],
    },
    expected_state: {
      answers: {
        secret_mode: ['600', '0600', '-rw-------'],
        world_writable: ['tmp/scratch.log', './tmp/scratch.log'],
        hidden_flag: ['NAV-OK-7F3A'],
      },
      passThresholdPercent: 100,
    },
    dcwf_code: null,
    sort_order: 0,
    ...overrides,
  };
}

describe('fsPermissionsLab scorer', () => {
  it('registers fs_permissions_lab and aliases', () => {
    const registered = listRegisteredTicketTypes();
    expect(registered).toContain('fs_permissions_lab');
    expect(registered).toContain('sandbox_permissions');
    expect(registered).toContain('ls_permissions');
    expect(registered).toContain('permissions_explore');
    expect(getTicketScorer('fs_permissions_lab')).toBeTruthy();
    expect(getTicketScorer('sandbox_permissions')).toBe(
      getTicketScorer('fs_permissions_lab')
    );
  });

  it('normalizes octal modes, symbolic modes, and paths', () => {
    expect(normalizeFsAnswer('0600')).toBe('600');
    expect(normalizeFsAnswer('-rw-------')).toBe('rw-------');
    expect(normalizeFsAnswer('./tmp/scratch.log')).toBe('tmp/scratch.log');
    expect(normalizeFsAnswer('  NAV-OK-7F3A  ')).toBe('nav-ok-7f3a');
  });

  it('parses questions and expected answers', () => {
    expect(parseFsPermissionsLabQuestions(ticket().initial_state)).toHaveLength(
      3
    );
    expect(
      parseFsPermissionsLabExpectedState(ticket().expected_state)?.answers
        .secret_mode
    ).toEqual(['600', '0600', '-rw-------']);
  });

  it('extracts submission answers', () => {
    expect(
      extractFsPermissionsLabSubmission({
        type: 'fs_permissions_lab',
        answers: { secret_mode: '600' },
      })
    ).toEqual({
      type: 'fs_permissions_lab',
      answers: { secret_mode: '600' },
    });
  });

  it('fails when expected_state is misconfigured', () => {
    const result = evaluateFsPermissionsLab(
      {
        answers: {
          secret_mode: '600',
          world_writable: 'tmp/scratch.log',
          hidden_flag: 'NAV-OK-7F3A',
        },
      },
      ticket({ expected_state: {} })
    );
    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('misconfigured_expected_state');
  });

  it('fails when answers are missing', () => {
    const result = evaluateFsPermissionsLab({}, ticket());
    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('missing_answers');
  });

  it('resolves when all answers match (including aliases)', () => {
    const result = evaluateFsPermissionsLab(
      {
        type: 'fs_permissions_lab',
        answers: {
          secret_mode: '-rw-------',
          world_writable: './tmp/scratch.log',
          hidden_flag: 'nav-ok-7f3a',
        },
      },
      ticket()
    );
    expect(result.ok).toBe(true);
    expect(result.structured.matchedCount).toBe(3);
    expect(result.structured.scorePercent).toBe(100);
  });

  it('needs revision when one answer is wrong', () => {
    const result = evaluateFsPermissionsLab(
      {
        answers: {
          secret_mode: '644',
          world_writable: 'tmp/scratch.log',
          hidden_flag: 'NAV-OK-7F3A',
        },
      },
      ticket()
    );
    expect(result.ok).toBe(false);
    expect(result.structured.matchedCount).toBe(2);
    expect(
      result.structured.questionResults.find((r) => r.id === 'secret_mode')
        ?.match
    ).toBe(false);
  });

  it('honors passThresholdPercent below 100', () => {
    const result = evaluateFsPermissionsLab(
      {
        answers: {
          secret_mode: '600',
          world_writable: 'tmp/scratch.log',
          hidden_flag: 'WRONG',
        },
      },
      ticket({
        expected_state: {
          answers: {
            secret_mode: ['600'],
            world_writable: ['tmp/scratch.log'],
            hidden_flag: ['NAV-OK-7F3A'],
          },
          passThresholdPercent: 66,
        },
      })
    );
    expect(result.structured.scorePercent).toBe(67);
    expect(result.ok).toBe(true);
  });
});
