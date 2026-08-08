import {
  buildSspFragment,
  type OscalSspDocument,
  type SspRequirementAnswer,
} from '@/lib/oscal/buildSspFragment';
import {
  IMPLEMENTATION_STATUSES,
  NIST_800_171_REV3_SUBSET,
  OSCAL_SSP_MIN_NARRATIVE_LENGTH,
  findSubsetRequirement,
  isImplementationStatus,
  isKnownResponsibleRoleId,
  type Nist800171Requirement,
} from '@/lib/oscal/nist800171Subset';
import {
  formatSspSchemaErrors,
  validateOscalSsp,
  type SspSchemaError,
} from '@/lib/oscal/validateSsp';
import type {
  ScorableTicket,
  TicketScoreResult,
  TicketScorer,
  TicketSubmission,
} from '@/lib/scoring/index';

export { OSCAL_SSP_MIN_NARRATIVE_LENGTH };

export type OscalSspStructuredResult = {
  style: 'oscal_ssp';
  valid: boolean;
  answeredCount: number;
  requiredCount: number;
  missingRequirementIds?: string[];
  fieldErrors?: string[];
  schemaErrors?: SspSchemaError[];
  ssp?: OscalSspDocument;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function parseRequirementsFromTicket(
  ticket: ScorableTicket
): Nist800171Requirement[] {
  const initial = asRecord(ticket.initial_state);
  const raw = initial.requirements;
  if (!Array.isArray(raw) || raw.length === 0) {
    return [...NIST_800_171_REV3_SUBSET];
  }

  const parsed: Nist800171Requirement[] = [];
  for (const entry of raw) {
    const record = asRecord(entry);
    const id = typeof record.id === 'string' ? record.id.trim() : '';
    const oscalControlId =
      typeof record.oscalControlId === 'string'
        ? record.oscalControlId.trim()
        : id
          ? `r${id}`
          : '';
    const title = typeof record.title === 'string' ? record.title.trim() : '';
    const family =
      typeof record.family === 'string' ? record.family.trim() : 'General';
    const statement =
      typeof record.statement === 'string' ? record.statement.trim() : '';
    if (!id || !oscalControlId || !title || !statement) continue;
    parsed.push({ id, oscalControlId, family, title, statement });
  }

  return parsed.length > 0 ? parsed : [...NIST_800_171_REV3_SUBSET];
}

function parseAnswers(
  submission: TicketSubmission
): { answers?: SspRequirementAnswer[]; fieldErrors: string[] } {
  const fieldErrors: string[] = [];
  const raw = submission.answers;
  if (!Array.isArray(raw)) {
    return {
      fieldErrors: [
        'Submission must include an answers array (one entry per requirement).',
      ],
    };
  }

  const answers: SspRequirementAnswer[] = [];
  raw.forEach((entry, index) => {
    const record = asRecord(entry);
    const requirementId =
      typeof record.requirementId === 'string'
        ? record.requirementId.trim()
        : typeof record.id === 'string'
          ? record.id.trim()
          : '';
    if (!requirementId) {
      fieldErrors.push(`answers[${index}]: requirementId is required.`);
      return;
    }

    const statusRaw = record.implementationStatus ?? record.status;
    if (!isImplementationStatus(statusRaw)) {
      fieldErrors.push(
        `answers[${index}] (${requirementId}): implementationStatus must be one of ${IMPLEMENTATION_STATUSES.join(', ')}.`
      );
      return;
    }

    const roleRaw = record.responsibleRoleId ?? record.responsibleRole;
    if (typeof roleRaw !== 'string' || !roleRaw.trim()) {
      fieldErrors.push(
        `answers[${index}] (${requirementId}): responsibleRoleId is required.`
      );
      return;
    }
    if (!isKnownResponsibleRoleId(roleRaw.trim())) {
      fieldErrors.push(
        `answers[${index}] (${requirementId}): responsibleRoleId "${roleRaw}" is not a recognized role.`
      );
      return;
    }

    const narrativeRaw =
      record.implementationNarrative ??
      record.narrative ??
      record.description;
    if (typeof narrativeRaw !== 'string' || !narrativeRaw.trim()) {
      fieldErrors.push(
        `answers[${index}] (${requirementId}): implementationNarrative is required.`
      );
      return;
    }
    const narrative = narrativeRaw.trim();
    if (narrative.length < OSCAL_SSP_MIN_NARRATIVE_LENGTH) {
      fieldErrors.push(
        `answers[${index}] (${requirementId}): implementationNarrative must be at least ${OSCAL_SSP_MIN_NARRATIVE_LENGTH} characters.`
      );
      return;
    }

    answers.push({
      requirementId,
      implementationStatus: statusRaw,
      responsibleRoleId: roleRaw.trim(),
      implementationNarrative: narrative,
    });
  });

  return { answers, fieldErrors };
}

function result(
  status: TicketScoreResult['status'],
  structuredResult: OscalSspStructuredResult,
  feedback: string
): TicketScoreResult {
  return { status, structuredResult, feedback };
}

/**
 * Deterministic OSCAL SSP ticket scorer:
 * 1) require answers for every curated requirement
 * 2) build a minimal SSP JSON document from the form
 * 3) validate against the vendored OSCAL SSP JSON Schema
 */
export const oscalSspTicketScorer: TicketScorer = {
  score(submission, ticket) {
    const requirements = parseRequirementsFromTicket(ticket);
    const requiredIds = requirements.map((req) => req.id);
    const { answers, fieldErrors } = parseAnswers(submission);

    if (fieldErrors.length > 0 || !answers) {
      return result(
        'needs_revision',
        {
          style: 'oscal_ssp',
          valid: false,
          answeredCount: answers?.length ?? 0,
          requiredCount: requiredIds.length,
          fieldErrors,
        },
        `OSCAL SSP form incomplete.\n${fieldErrors.join('\n')}`
      );
    }

    const answeredIds = new Set(
      answers.map((answer) => {
        const match = findSubsetRequirement(answer.requirementId, requirements);
        return (match?.id ?? answer.requirementId).toLowerCase();
      })
    );
    const missingRequirementIds = requiredIds.filter(
      (id) => !answeredIds.has(id.toLowerCase())
    );

    if (missingRequirementIds.length > 0) {
      return result(
        'needs_revision',
        {
          style: 'oscal_ssp',
          valid: false,
          answeredCount: answers.length,
          requiredCount: requiredIds.length,
          missingRequirementIds,
        },
        `OSCAL SSP form incomplete. Missing answers for: ${missingRequirementIds.join(', ')}.`
      );
    }

    // Keep only answers for required requirements (ignore extras).
    const orderedAnswers = requiredIds.map((id) => {
      const answer = answers.find((entry) => {
        const match = findSubsetRequirement(entry.requirementId, requirements);
        const answeredId = (
          match?.id ?? entry.requirementId
        ).toLowerCase();
        return answeredId === id.toLowerCase();
      });
      if (!answer) {
        throw new Error(`Missing answer for ${id} after completeness check`);
      }
      return answer;
    });

    let ssp: OscalSspDocument;
    try {
      ssp = buildSspFragment({
        answers: orderedAnswers,
        requirements,
        systemName:
          typeof asRecord(ticket.initial_state).systemName === 'string'
            ? String(asRecord(ticket.initial_state).systemName)
            : undefined,
        title:
          typeof asRecord(ticket.initial_state).sspTitle === 'string'
            ? String(asRecord(ticket.initial_state).sspTitle)
            : undefined,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to build OSCAL SSP.';
      return result(
        'needs_revision',
        {
          style: 'oscal_ssp',
          valid: false,
          answeredCount: orderedAnswers.length,
          requiredCount: requiredIds.length,
          fieldErrors: [message],
        },
        `Could not compile OSCAL SSP fragment: ${message}`
      );
    }

    const validation = validateOscalSsp(ssp);
    if (!validation.valid) {
      const schemaErrors = validation.errors;
      return result(
        'needs_revision',
        {
          style: 'oscal_ssp',
          valid: false,
          answeredCount: orderedAnswers.length,
          requiredCount: requiredIds.length,
          schemaErrors,
          ssp,
        },
        `OSCAL SSP schema validation failed. Fix the following and resubmit:\n${formatSspSchemaErrors(schemaErrors)}`
      );
    }

    return result(
      'resolved',
      {
        style: 'oscal_ssp',
        valid: true,
        answeredCount: orderedAnswers.length,
        requiredCount: requiredIds.length,
        schemaErrors: [],
        ssp,
      },
      `OSCAL SSP fragment accepted. Validated ${orderedAnswers.length} implemented requirement(s) against the NIST OSCAL SSP JSON Schema.`
    );
  },
};
