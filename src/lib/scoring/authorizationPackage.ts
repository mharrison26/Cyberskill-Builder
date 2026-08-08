import {
  compileStudentPackage,
  type CompiledAuthorizationPackage,
} from '@/lib/capstone/compilePackage';
import {
  isAuthorizationPackageTicketType,
  type GrcTicketCode,
} from '@/lib/capstone/ticketCodes';
import { createClient } from '@/lib/supabase/server';
import type {
  ScorableTicket,
  TicketScoreResult,
  TicketScorer,
  TicketSubmission,
} from '@/lib/scoring/index';

export type AuthorizationPackageStructuredResult = {
  style: 'authorization_package';
  acknowledged: boolean;
  packageComplete: boolean;
  missingCodes: GrcTicketCode[];
  artifactStatuses: Array<{
    code: GrcTicketCode;
    status: string;
    summary: string;
  }>;
  reason?: string;
};

export type PackageCompileFn = (
  ticket: ScorableTicket
) => Promise<CompiledAuthorizationPackage>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function extractAcknowledgment(submission: TicketSubmission): boolean {
  if (submission.acknowledged === true || submission.acknowledge === true) {
    return true;
  }
  if (submission.packageReviewed === true) {
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

async function defaultCompilePackage(
  ticket: ScorableTicket
): Promise<CompiledAuthorizationPackage> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Unauthorized');
  }

  return compileStudentPackage({
    supabase,
    studentId: user.id,
    trackId: ticket.track_id,
    initialState: isPlainObject(ticket.initial_state)
      ? ticket.initial_state
      : {},
  });
}

export function createAuthorizationPackageTicketScorer(
  compile: PackageCompileFn = defaultCompilePackage
): TicketScorer {
  return {
    async score(submission, ticket): Promise<TicketScoreResult> {
      if (!isAuthorizationPackageTicketType(ticket.ticket_type)) {
        // Still allow scoring if registered under this type.
      }

      const acknowledged = extractAcknowledgment(submission);
      let pkg: CompiledAuthorizationPackage;

      try {
        pkg = await compile(ticket);
      } catch (error) {
        console.error('authorization package compile failed:', error);
        return {
          status: 'needs_revision',
          structuredResult: {
            style: 'authorization_package',
            acknowledged,
            packageComplete: false,
            missingCodes: [],
            artifactStatuses: [],
            reason: 'compile_failed',
          } satisfies AuthorizationPackageStructuredResult,
          feedback:
            'Could not compile your authorization package from prior tickets. Ensure GRC-03, GRC-04, and GRC-09 are submitted, then try again.',
        };
      }

      const structured: AuthorizationPackageStructuredResult = {
        style: 'authorization_package',
        acknowledged,
        packageComplete: pkg.complete,
        missingCodes: pkg.missingCodes,
        artifactStatuses: pkg.artifacts.map((a) => ({
          code: a.code,
          status: a.status,
          summary: a.summary,
        })),
      };

      if (!pkg.complete) {
        return {
          status: 'needs_revision',
          structuredResult: {
            ...structured,
            reason: 'incomplete_package',
          },
          feedback: `Authorization package incomplete. Missing or unresolved: ${pkg.missingCodes.join(', ')}. Complete GRC-03 (oscal_ssp), GRC-04 (poam), and GRC-09 (oscal_generator) first.`,
        };
      }

      if (!acknowledged) {
        return {
          status: 'needs_revision',
          structuredResult: {
            ...structured,
            reason: 'not_acknowledged',
          },
          feedback:
            'Review the compiled authorization package, then acknowledge that you have reviewed all artifacts before submitting.',
        };
      }

      return {
        status: 'resolved',
        structuredResult: structured,
        feedback:
          'Authorization package compiled and acknowledged. Proceed to the Authorizing Official (AO) review Q&A ticket.',
      };
    },
  };
}

export const authorizationPackageTicketScorer: TicketScorer =
  createAuthorizationPackageTicketScorer();
