import { NextResponse } from 'next/server';

import { scanStoredLessonSubmission } from '@/lib/compliance/scanStoredLessonSubmission';
import { triggerGrading } from '@/lib/grading/triggerGrading';
import { validateCCCER } from '@/lib/lessons/cccerValidation';
import {
  resolveSubmitLessonContext,
  upsertLessonSubmission,
} from '@/lib/lessons/submitLessonContext';
import { validateToolWalkthroughSubmission } from '@/lib/lessons/toolWalkthroughValidation';
import { createClient } from '@/lib/supabase/server';

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

    const { data: progress, error: progressError } =
      await upsertLessonSubmission(context, lessonId, validation.data);

    if (progressError || !progress) {
      console.error('lesson_progress upsert failed:', progressError);
      return NextResponse.json(
        { error: 'Failed to save submission' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { success: true, progressId: progress.id },
      { status: 201 }
    );
  }

  const validation = validateCCCER(body);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const { data: progress, error: progressError } = await upsertLessonSubmission(
    context,
    lessonId,
    validation.data
  );

  if (progressError || !progress) {
    console.error('lesson_progress upsert failed:', progressError);
    return NextResponse.json(
      { error: 'Failed to save submission' },
      { status: 500 }
    );
  }

  await triggerGrading({
    supabase: context.supabase,
    progressId: progress.id,
    studentId: context.appUser.id,
    tenantId: context.appUser.tenant_id,
    lessonId: context.lesson.id,
    trackId: context.lesson.track_id,
    dcwfCode: context.lesson.dcwf_code,
    submission: validation.data,
  });

  return NextResponse.json(
    { success: true, progressId: progress.id },
    { status: 201 }
  );
}
