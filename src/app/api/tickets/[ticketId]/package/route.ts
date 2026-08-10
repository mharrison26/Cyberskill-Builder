import { NextResponse } from 'next/server';

import { compileStudentPackage } from '@/lib/capstone/compilePackage';
import {
  isAoReviewTicketType,
  isAuthorizationPackageTicketType,
  isSecurityAssessmentReportTicketType,
} from '@/lib/capstone/ticketCodes';
import { createClient } from '@/lib/supabase/server';
import { resolveSubmitTicketContext } from '@/lib/tickets/submitTicketContext';

type RouteContext = {
  params: { ticketId: string };
};

export async function GET(_request: Request, { params }: RouteContext) {
  const { ticketId } = params;
  const supabase = await createClient();

  const resolved = await resolveSubmitTicketContext(supabase, ticketId);
  if (!resolved.ok) {
    return resolved.response;
  }

  const { context } = resolved;
  const ticketType = context.ticket.ticket_type;

  if (
    !isAuthorizationPackageTicketType(ticketType) &&
    !isAoReviewTicketType(ticketType) &&
    !isSecurityAssessmentReportTicketType(ticketType)
  ) {
    return NextResponse.json(
      {
        error:
          'Package compilation is only available for authorization_package, ao_review, and security_assessment_report tickets',
      },
      { status: 400 }
    );
  }

  try {
    const pkg = await compileStudentPackage({
      supabase: context.supabase,
      studentId: context.appUser.id,
      trackId: context.ticket.track_id,
      initialState: context.ticket.initial_state,
    });

    return NextResponse.json({
      complete: pkg.complete,
      missingCodes: pkg.missingCodes,
      compiledAt: pkg.compiledAt,
      packageSource: pkg.packageSource ?? null,
      trackId: pkg.trackId,
      studentId: pkg.studentId,
      artifacts: pkg.artifacts.map((artifact) => ({
        code: artifact.code,
        label: artifact.label,
        status: artifact.status,
        summary: artifact.summary,
        ticketId: artifact.ticketId,
        progressStatus: artifact.progressStatus,
        payload: artifact.payload,
      })),
    });
  } catch (error) {
    console.error('package compile failed:', error);
    return NextResponse.json(
      { error: 'Failed to compile authorization package' },
      { status: 500 }
    );
  }
}
