import { NextResponse } from 'next/server';

import { scanStoredLessonSubmission } from '@/lib/compliance/scanStoredLessonSubmission';
import { enqueueGrading } from '@/lib/grading/enqueueGrading';
import { scheduleGradingWorker } from '@/lib/grading/scheduleGradingWorker';
import { validateCatalogLabSubmission } from '@/lib/lessons/catalogLabValidation';
import { validateCCCER } from '@/lib/lessons/cccerValidation';
import { validateConceptualSubmission } from '@/lib/lessons/conceptualValidation';
import {
  resolveSubmitLessonContext,
  upsertLessonSubmission,
  type LessonSubmissionPayload,
  type SubmitLessonContext,
} from '@/lib/lessons/submitLessonContext';
import { validateToolWalkthroughSubmission } from '@/lib/lessons/toolWalkthroughValidation';
import { createClient } from '@/lib/supabase/server';

/**
 * Persist submission quickly. AI grading runs in the background worker
 * (`/api/cron/process-grading`) so this route stays under serverless limits.
 */
export const maxDuration = 30;

type RouteContext = {
  params: { lessonId: string };
};

function isToolWalkthroughBody(
  body: unknown
): body is Record<string, unknown> & { type: 'tool_walkthrough' } {
  return (
    typeof body === 'object' &&
    body !== null &&
    (body as Record<string, unknown>).type === 'tool_walkthrough'
  );
}

function isCatalogLabBody(
  body: unknown
): body is Record<string, unknown> & { type: 'catalog_lab' } {
  return (
    typeof body === 'object' &&
    body !== null &&
    (body as Record<string, unknown>).type === 'catalog_lab'
  );
}

function isConceptualBody(
  body: unknown
): body is Record<string, unknown> & { type: 'conceptual' } {
  return (
    typeof body === 'object' &&
    body !== null &&
    (body as Record<string, unknown>).type === 'conceptual'
  );
}

async function persistThenEnqueue(
  context: SubmitLessonContext,
  lessonId: string,
  submission: LessonSubmissionPayload
) {
  const { data: progress, error: progressError } = await upsertLessonSubmission(
    context,
    lessonId,
    submission
  );

  if (progressError || !progress) {
    console.error('lesson_progress upsert failed:', progressError);
    return NextResponse.json(
      { error: 'Failed to save submission' },
      { status: 500 }
    );
  }

  // Submission is durable before grading is scheduled. Grading failures must
  // not roll back or hide the saved answer.
  const grading = await enqueueGrading({
    supabase: context.supabase,
    progressId: progress.id,
    studentId: context.appUser.id,
    lessonId: context.lesson.id,
    resetAttempts: true,
  });

  await scheduleGradingWorker(progress.id);

  return NextResponse.json(
    {
      success: true,
      progressId: progress.id,
      grading: {
        status: grading.status,
        findingId: null,
        aiFindingState: null,
        error: null,
      },
    },
    { status: 201 }
  );
}

export async function POST(request: Request, { params }: RouteContext) {
  const { lessonId } = params;
  const supabase = await createClient();

  const resolved = await resolveSubmitLessonContext(supabase, lessonId);
  if (!resolved.ok) {
    return resolved.response;
  }

  const { context } = resolved;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (isToolWalkthroughBody(body)) {
    const validation = validateToolWalkthroughSubmission(body, {
      tenantId: context.appUser.tenant_id,
      studentId: context.appUser.id,
      lessonId,
    });

    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const scanResult = await scanStoredLessonSubmission(
      context.supabase,
      validation.data.storagePath
    );

    if (!scanResult.ok) {
      return NextResponse.json({ error: scanResult.error }, { status: 422 });
    }

    return persistThenEnqueue(context, lessonId, validation.data);
  }

  if (isCatalogLabBody(body)) {
    const validation = validateCatalogLabSubmission(body);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    return persistThenEnqueue(context, lessonId, validation.data);
  }

  if (isConceptualBody(body)) {
    const validation = validateConceptualSubmission(body);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    return persistThenEnqueue(context, lessonId, validation.data);
  }

  const validation = validateCCCER(body);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  return persistThenEnqueue(context, lessonId, validation.data);
}
