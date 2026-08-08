import { describe, expect, it } from 'vitest';

import type { CompiledAuthorizationPackage } from '@/lib/capstone/compilePackage';
import { GRC_TICKET_CODES } from '@/lib/capstone/ticketCodes';
import type { ScorableTicket } from '@/lib/scoring';
import {
  createAuthorizationPackageTicketScorer,
  extractAcknowledgment,
} from '@/lib/scoring/authorizationPackage';

function ticket(): ScorableTicket {
  return {
    id: 't-pkg',
    tenant_id: 'ten1',
    track_id: 'tr1',
    tier: 3,
    ticket_type: 'authorization_package',
    difficulty: 'high',
    sla_minutes: 60,
    scenario_brief: 'Compile the authorization package.',
    initial_state: { ticketCode: 'GRC-10' },
    expected_state: {},
    dcwf_code: '612',
    sort_order: 90,
  };
}

function pkg(complete: boolean): CompiledAuthorizationPackage {
  return {
    trackId: 'tr1',
    studentId: 'stu1',
    complete,
    missingCodes: complete ? [] : [GRC_TICKET_CODES.POAM],
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
        payload: { ssp: true },
        textCorpus: 'ssp',
      },
      {
        code: GRC_TICKET_CODES.POAM,
        label: 'POAM',
        ticketTypes: ['poam'],
        status: complete ? 'present' : 'missing',
        ticketId: complete ? 'b' : null,
        progressStatus: complete ? 'resolved' : null,
        summary: complete ? 'ok' : 'missing',
        payload: complete ? { entries: [] } : null,
        textCorpus: complete ? 'poam' : '',
      },
      {
        code: GRC_TICKET_CODES.OSCAL_GENERATOR,
        label: 'OSCAL',
        ticketTypes: ['oscal_generator'],
        status: 'present',
        ticketId: 'c',
        progressStatus: 'resolved',
        summary: 'ok',
        payload: { files: {} },
        textCorpus: 'oscal',
      },
    ],
  };
}

describe('extractAcknowledgment', () => {
  it('accepts common acknowledgment shapes', () => {
    expect(extractAcknowledgment({ acknowledged: true })).toBe(true);
    expect(extractAcknowledgment({ packageReviewed: true })).toBe(true);
    expect(extractAcknowledgment({ acknowledgment: 'reviewed' })).toBe(true);
    expect(extractAcknowledgment({})).toBe(false);
  });
});

describe('createAuthorizationPackageTicketScorer', () => {
  it('requires a complete package and acknowledgment', async () => {
    const incomplete = createAuthorizationPackageTicketScorer(async () =>
      pkg(false)
    );
    const incompleteResult = await incomplete.score(
      { acknowledged: true },
      ticket()
    );
    expect(incompleteResult.status).toBe('needs_revision');
    expect(incompleteResult.structuredResult.reason).toBe('incomplete_package');

    const complete = createAuthorizationPackageTicketScorer(async () =>
      pkg(true)
    );
    const notAck = await complete.score({}, ticket());
    expect(notAck.status).toBe('needs_revision');
    expect(notAck.structuredResult.reason).toBe('not_acknowledged');

    const ok = await complete.score({ acknowledged: true }, ticket());
    expect(ok.status).toBe('resolved');
  });
});
