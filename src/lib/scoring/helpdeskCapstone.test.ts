import { describe, expect, it } from 'vitest';

import type { CompiledKnowledgeBase } from '@/lib/helpdesk/compileKnowledgeBase';
import {
  isFlagshipEligibleTicketType,
  isHelpdeskCapstoneTicketType,
} from '@/lib/helpdesk/ticketCodes';
import type { ScorableTicket } from '@/lib/scoring';
import {
  createHelpdeskCapstoneTicketScorer,
  evaluateProcessDocument,
  extractAcknowledgment,
  extractProcessDocument,
} from '@/lib/scoring/helpdeskCapstone';
import {
  HELPDESK_PROCESS_DOC_MIN_SECTION_LENGTH,
  HELPDESK_PROCESS_DOC_SECTION_KEYS,
} from '@/lib/scoring/ticketUi';

function ticket(): ScorableTicket {
  return {
    id: 't-hd-cap',
    tenant_id: 'ten1',
    track_id: 'tr1',
    tier: 3,
    ticket_type: 'helpdesk_capstone',
    difficulty: 'high',
    sla_minutes: 90,
    scenario_brief: 'HD-07: Compile KB + onboarding process doc',
    initial_state: { ticketCode: 'HD-07', flagship: true },
    expected_state: { minArticles: 1, flagshipOnResolve: true },
    dcwf_code: '411',
    sort_order: 95,
  };
}

function long(
  text: string,
  min = HELPDESK_PROCESS_DOC_MIN_SECTION_LENGTH
): string {
  if (text.length >= min) return text;
  return `${text} ${'x'.repeat(min - text.length)}`;
}

function processSections() {
  const sections: Record<string, string> = {};
  for (const key of HELPDESK_PROCESS_DOC_SECTION_KEYS) {
    sections[key] = long(`Content for ${key} covering practical steps.`);
  }
  return sections;
}

function kb(complete: boolean): CompiledKnowledgeBase {
  return {
    trackId: 'tr1',
    studentId: 'stu1',
    complete,
    presentCount: complete ? 1 : 0,
    minArticles: 1,
    sourceTicketTypes: ['kb_writeup'],
    compiledAt: new Date().toISOString(),
    articles: complete
      ? [
          {
            ticketId: 'kb1',
            ticketType: 'kb_writeup',
            ticketCode: 'HD-03',
            title: 'VPN MFA lockout',
            status: 'present',
            progressStatus: 'resolved',
            summary: 'Problem: VPN MFA…',
            article: {
              problem: 'VPN MFA timed out',
              rootCause: 'Late push approval',
              resolutionSteps: 'Clear lockout and reconnect',
              preventionTip: 'Approve promptly',
            },
            textCorpus: 'VPN MFA',
          },
        ]
      : [],
  };
}

describe('helpdesk capstone ticket codes', () => {
  it('recognizes capstone aliases and flagship eligibility', () => {
    expect(isHelpdeskCapstoneTicketType('helpdesk_capstone')).toBe(true);
    expect(isHelpdeskCapstoneTicketType('kb_capstone')).toBe(true);
    expect(
      isHelpdeskCapstoneTicketType('helpdesk.onboarding_process_capstone')
    ).toBe(true);
    expect(isHelpdeskCapstoneTicketType('kb_writeup')).toBe(false);
    expect(isFlagshipEligibleTicketType('ao_review')).toBe(true);
    expect(isFlagshipEligibleTicketType('helpdesk_capstone')).toBe(true);
    expect(isFlagshipEligibleTicketType('infra_design_capstone')).toBe(true);
    expect(isFlagshipEligibleTicketType('triage')).toBe(false);
  });
});

describe('extractProcessDocument / acknowledgment', () => {
  it('extracts nested process document and acknowledgment shapes', () => {
    const doc = extractProcessDocument({
      processDocument: {
        title: 'Onboarding checklist',
        sections: { purpose: 'Train new hires' },
      },
    });
    expect(doc?.title).toBe('Onboarding checklist');
    expect(doc?.sections.purpose).toBe('Train new hires');
    expect(extractAcknowledgment({ acknowledged: true })).toBe(true);
    expect(extractAcknowledgment({ kbReviewed: true })).toBe(true);
    expect(extractAcknowledgment({})).toBe(false);
  });
});

describe('evaluateProcessDocument', () => {
  it('requires title and all section min lengths', () => {
    const ok = evaluateProcessDocument({
      title: 'Help Desk New-Hire Onboarding',
      sections: processSections(),
    });
    expect(ok.ok).toBe(true);

    const short = evaluateProcessDocument({
      title: 'Short',
      sections: { purpose: 'too short' },
    });
    expect(short.ok).toBe(false);
    expect(short.missingSections.length).toBeGreaterThan(0);
  });
});

describe('helpdeskCapstoneTicketScorer', () => {
  it('resolves when KB complete, process doc ok, and acknowledged', async () => {
    const scorer = createHelpdeskCapstoneTicketScorer(async () => kb(true));
    const result = await scorer.score(
      {
        type: 'helpdesk_capstone',
        acknowledged: true,
        processDocument: {
          title: 'Help Desk New-Hire Onboarding Checklist',
          sections: processSections(),
        },
      },
      ticket()
    );
    expect(result.status).toBe('resolved');
    expect(result.structuredResult.style).toBe('helpdesk_capstone');
    expect(result.structuredResult.flagshipEligible).toBe(true);
    expect(result.structuredResult.kbComplete).toBe(true);
  });

  it('needs revision when KB incomplete', async () => {
    const scorer = createHelpdeskCapstoneTicketScorer(async () => kb(false));
    const result = await scorer.score(
      {
        acknowledged: true,
        processDocument: {
          title: 'Help Desk New-Hire Onboarding Checklist',
          sections: processSections(),
        },
      },
      ticket()
    );
    expect(result.status).toBe('needs_revision');
    expect(result.structuredResult.reason).toBe('incomplete_kb');
  });

  it('needs revision when not acknowledged', async () => {
    const scorer = createHelpdeskCapstoneTicketScorer(async () => kb(true));
    const result = await scorer.score(
      {
        processDocument: {
          title: 'Help Desk New-Hire Onboarding Checklist',
          sections: processSections(),
        },
      },
      ticket()
    );
    expect(result.status).toBe('needs_revision');
    expect(result.structuredResult.reason).toBe('not_acknowledged');
  });
});
