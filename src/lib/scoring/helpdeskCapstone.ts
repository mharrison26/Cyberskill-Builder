import {
  compileStudentKnowledgeBase,
  type CompiledKnowledgeBase,
} from '@/lib/helpdesk/compileKnowledgeBase';
import { isHelpdeskCapstoneTicketType } from '@/lib/helpdesk/ticketCodes';
import { createClient } from '@/lib/supabase/server';
import type {
  ScorableTicket,
  TicketScoreResult,
  TicketScorer,
  TicketSubmission,
} from '@/lib/scoring/index';
import {
  HELPDESK_PROCESS_DOC_MIN_SECTION_LENGTH,
  HELPDESK_PROCESS_DOC_MIN_TITLE_LENGTH,
  HELPDESK_PROCESS_DOC_SECTION_KEYS,
  type HelpdeskProcessDocSectionKey,
} from '@/lib/scoring/ticketUi';

/**
 * Helpdesk Tier 3 capstone (HD-07 / PI-07 flagship).
 *
 * Deterministic:
 *   - prior KB articles (HD-03 kb_writeup family; HD-02 legacy) compile to a mini KB
 *   - process document (new-hire onboarding checklist) has title + required sections
 *   - student acknowledges review of the compiled KB
 *
 * On resolve, submit route marks portfolio_items.is_flagship for this track.
 */

export {
  HELPDESK_PROCESS_DOC_MIN_SECTION_LENGTH,
  HELPDESK_PROCESS_DOC_MIN_TITLE_LENGTH,
  HELPDESK_PROCESS_DOC_SECTION_KEYS,
  HELPDESK_PROCESS_DOC_SECTION_LABELS,
  type HelpdeskProcessDocSectionKey,
} from '@/lib/scoring/ticketUi';

export type HelpdeskCapstoneExpectedState = {
  minArticles?: number;
  minSectionLength?: number;
  minTitleLength?: number;
  requiredSections?: string[];
  requireAcknowledgment?: boolean;
};

export type HelpdeskProcessDocument = {
  title: string;
  sections: Record<string, string>;
};

export type HelpdeskCapstoneSubmission = {
  type?: string;
  processDocument: HelpdeskProcessDocument;
  acknowledged: boolean;
};

export type HelpdeskCapstoneStructuredResult = {
  style: 'helpdesk_capstone';
  flagshipEligible: true;
  acknowledged: boolean;
  kbComplete: boolean;
  presentArticleCount: number;
  minArticles: number;
  processDocOk: boolean;
  titleLength: number;
  minTitleLength: number;
  minSectionLength: number;
  missingSections: string[];
  shortSections: string[];
  articles: Array<{
    ticketId: string;
    ticketCode: string | null;
    title: string;
    status: string;
    summary: string;
  }>;
  processDocument: HelpdeskProcessDocument | null;
  reason?: string;
};

export type KnowledgeBaseCompileFn = (
  ticket: ScorableTicket
) => Promise<CompiledKnowledgeBase>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function parseHelpdeskCapstoneExpectedState(
  expectedState: Record<string, unknown> | null | undefined
): HelpdeskCapstoneExpectedState {
  if (!isPlainObject(expectedState)) return {};
  return expectedState as HelpdeskCapstoneExpectedState;
}

export function resolveRequiredSections(
  expected: HelpdeskCapstoneExpectedState
): HelpdeskProcessDocSectionKey[] {
  if (
    Array.isArray(expected.requiredSections) &&
    expected.requiredSections.length > 0
  ) {
    const allowed = new Set<string>(HELPDESK_PROCESS_DOC_SECTION_KEYS);
    return expected.requiredSections
      .filter((key): key is string => typeof key === 'string')
      .map((key) => key.trim().toLowerCase())
      .filter((key): key is HelpdeskProcessDocSectionKey => allowed.has(key));
  }
  return [...HELPDESK_PROCESS_DOC_SECTION_KEYS];
}

export function extractAcknowledgment(submission: TicketSubmission): boolean {
  if (submission.acknowledged === true || submission.acknowledge === true) {
    return true;
  }
  if (submission.kbReviewed === true || submission.packageReviewed === true) {
    return true;
  }
  if (
    typeof submission.acknowledgment === 'string' &&
    submission.acknowledgment.trim().toLowerCase() === 'reviewed'
  ) {
    return true;
  }
  return false;
}

function extractSections(raw: unknown): Record<string, string> | null {
  if (!isPlainObject(raw)) return null;
  const sections: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string') {
      sections[key.trim().toLowerCase()] = value.trim();
    }
  }
  return sections;
}

export function extractProcessDocument(
  submission: TicketSubmission
): HelpdeskProcessDocument | null {
  const nested = isPlainObject(submission.processDocument)
    ? submission.processDocument
    : isPlainObject(submission.process_document)
      ? submission.process_document
      : isPlainObject(submission.onboardingChecklist)
        ? submission.onboardingChecklist
        : null;

  const title =
    asNonEmptyString(nested?.title) ??
    asNonEmptyString(submission.processTitle) ??
    asNonEmptyString(submission.title);

  const sections =
    extractSections(nested?.sections) ??
    extractSections(submission.sections) ??
    extractSections(submission.checklistSections);

  if (!title || !sections) return null;

  return { title, sections };
}

export function evaluateProcessDocument(
  doc: HelpdeskProcessDocument | null,
  options?: {
    minTitleLength?: number;
    minSectionLength?: number;
    requiredSections?: HelpdeskProcessDocSectionKey[];
  }
): {
  ok: boolean;
  titleLength: number;
  missingSections: string[];
  shortSections: string[];
  minTitleLength: number;
  minSectionLength: number;
} {
  const minTitleLength =
    options?.minTitleLength ?? HELPDESK_PROCESS_DOC_MIN_TITLE_LENGTH;
  const minSectionLength =
    options?.minSectionLength ?? HELPDESK_PROCESS_DOC_MIN_SECTION_LENGTH;
  const required = options?.requiredSections ?? [
    ...HELPDESK_PROCESS_DOC_SECTION_KEYS,
  ];

  if (!doc) {
    return {
      ok: false,
      titleLength: 0,
      missingSections: [...required],
      shortSections: [],
      minTitleLength,
      minSectionLength,
    };
  }

  const titleLength = doc.title.trim().length;
  const missingSections: string[] = [];
  const shortSections: string[] = [];

  for (const key of required) {
    const value = doc.sections[key];
    if (typeof value !== 'string' || !value.trim()) {
      missingSections.push(key);
      continue;
    }
    if (value.trim().length < minSectionLength) {
      shortSections.push(key);
    }
  }

  const ok =
    titleLength >= minTitleLength &&
    missingSections.length === 0 &&
    shortSections.length === 0;

  return {
    ok,
    titleLength,
    missingSections,
    shortSections,
    minTitleLength,
    minSectionLength,
  };
}

async function defaultCompileKb(
  ticket: ScorableTicket
): Promise<CompiledKnowledgeBase> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Unauthorized');
  }

  return compileStudentKnowledgeBase({
    supabase,
    studentId: user.id,
    trackId: ticket.track_id,
    initialState: isPlainObject(ticket.initial_state)
      ? ticket.initial_state
      : {},
    expectedState: isPlainObject(ticket.expected_state)
      ? ticket.expected_state
      : {},
  });
}

export function createHelpdeskCapstoneTicketScorer(
  compile: KnowledgeBaseCompileFn = defaultCompileKb
): TicketScorer {
  return {
    async score(submission, ticket): Promise<TicketScoreResult> {
      void isHelpdeskCapstoneTicketType(ticket.ticket_type);

      const expected = parseHelpdeskCapstoneExpectedState(
        isPlainObject(ticket.expected_state) ? ticket.expected_state : {}
      );
      const acknowledged = extractAcknowledgment(submission);
      const processDocument = extractProcessDocument(submission);
      const requiredSections = resolveRequiredSections(expected);
      const processEval = evaluateProcessDocument(processDocument, {
        minTitleLength:
          typeof expected.minTitleLength === 'number'
            ? expected.minTitleLength
            : undefined,
        minSectionLength:
          typeof expected.minSectionLength === 'number'
            ? expected.minSectionLength
            : undefined,
        requiredSections,
      });

      let kb: CompiledKnowledgeBase;
      try {
        kb = await compile(ticket);
      } catch (error) {
        console.error('helpdesk capstone KB compile failed:', error);
        return {
          status: 'needs_revision',
          structuredResult: {
            style: 'helpdesk_capstone',
            flagshipEligible: true,
            acknowledged,
            kbComplete: false,
            presentArticleCount: 0,
            minArticles: expected.minArticles ?? 1,
            processDocOk: processEval.ok,
            titleLength: processEval.titleLength,
            minTitleLength: processEval.minTitleLength,
            minSectionLength: processEval.minSectionLength,
            missingSections: processEval.missingSections,
            shortSections: processEval.shortSections,
            articles: [],
            processDocument,
            reason: 'compile_failed',
          } satisfies HelpdeskCapstoneStructuredResult,
          feedback:
            'Could not compile your mini knowledge base from prior KB write-ups. Complete at least one kb_writeup (HD-03) ticket, then try again.',
        };
      }

      const structured: HelpdeskCapstoneStructuredResult = {
        style: 'helpdesk_capstone',
        flagshipEligible: true,
        acknowledged,
        kbComplete: kb.complete,
        presentArticleCount: kb.presentCount,
        minArticles: kb.minArticles,
        processDocOk: processEval.ok,
        titleLength: processEval.titleLength,
        minTitleLength: processEval.minTitleLength,
        minSectionLength: processEval.minSectionLength,
        missingSections: processEval.missingSections,
        shortSections: processEval.shortSections,
        articles: kb.articles.map((a) => ({
          ticketId: a.ticketId,
          ticketCode: a.ticketCode,
          title: a.title,
          status: a.status,
          summary: a.summary,
        })),
        processDocument,
      };

      if (!kb.complete) {
        return {
          status: 'needs_revision',
          structuredResult: {
            ...structured,
            reason: 'incomplete_kb',
          },
          feedback: `Mini knowledge base incomplete. Need at least ${kb.minArticles} resolved KB article(s) (kb_writeup / HD-03); found ${kb.presentCount}.`,
        };
      }

      if (!processEval.ok) {
        const parts: string[] = [];
        if (processEval.titleLength < processEval.minTitleLength) {
          parts.push(
            `title must be at least ${processEval.minTitleLength} characters`
          );
        }
        if (processEval.missingSections.length > 0) {
          parts.push(
            `missing sections: ${processEval.missingSections.join(', ')}`
          );
        }
        if (processEval.shortSections.length > 0) {
          parts.push(
            `sections too short (min ${processEval.minSectionLength}): ${processEval.shortSections.join(', ')}`
          );
        }
        return {
          status: 'needs_revision',
          structuredResult: {
            ...structured,
            reason: 'process_doc_incomplete',
          },
          feedback: `Process document needs work — ${parts.join('; ')}.`,
        };
      }

      const requireAck = expected.requireAcknowledgment !== false;
      if (requireAck && !acknowledged) {
        return {
          status: 'needs_revision',
          structuredResult: {
            ...structured,
            reason: 'not_acknowledged',
          },
          feedback:
            'Review the compiled mini knowledge base, then acknowledge that you have reviewed your prior KB articles before submitting.',
        };
      }

      return {
        status: 'resolved',
        structuredResult: structured,
        feedback:
          'Helpdesk capstone complete: mini knowledge base compiled and onboarding process document accepted. This resolution is marked as your track flagship portfolio item (PI-07).',
      };
    },
  };
}

export const helpdeskCapstoneTicketScorer: TicketScorer =
  createHelpdeskCapstoneTicketScorer();
