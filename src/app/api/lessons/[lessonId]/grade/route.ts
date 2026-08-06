import { NextResponse } from 'next/server';

import {
  gradeSubmission,
  MissingAnthropicApiKeyError,
} from '@/lib/grading/gradeSubmission';
import { createClient } from '@/lib/supabase/server';

type RouteContext = {
  params: { lessonId: string };
};

type GradeRequestBody = {
  studentId?: string;
};

export async function POST(request: Request, { params }: RouteContext) {
  const { lessonId } = params;
  const supabase = await createClient();

  const {
    data: { user: authUser },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !authUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: appUser, error: userError } = await supabase
    .from('users')
    .select('id, tenant_id, email, is_admin')
    .eq('id', authUser.id)
    .maybeSingle();

  if (userError || !appUser) {
    return NextResponse.json(
      { error: 'User profile not found' },
      { status: 403 }
    );
  }

  let body: GradeRequestBody = {};
  try {
    const rawBody = await request.text();
    if (rawBody.trim()) {
      body = JSON.parse(rawBody) as GradeRequestBody;
    }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const targetStudentId = body.studentId ?? appUser.id;

  if (targetStudentId !== appUser.id && appUser.is_admin !== true) {
    return NextResponse.json(
      { error: 'Forbidden: only admins may grade other students' },
      { status: 403 }
    );
  }

  const { data: targetUser, error: targetUserError } = await supabase
    .from('users')
    .select('id, tenant_id')
    .eq('id', targetStudentId)
    .maybeSingle();

  if (targetUserError || !targetUser) {
    return NextResponse.json(
      { error: 'Student profile not found' },
      { status: 404 }
    );
  }

  const { data: lesson, error: lessonError } = await supabase
    .from('lessons')
    .select('id, track_id')
    .eq('id', lessonId)
    .maybeSingle();

  if (lessonError || !lesson) {
    return NextResponse.json({ error: 'Lesson not found' }, { status: 404 });
  }

  const { data: enrollment, error: enrollmentError } = await supabase
    .from('track_enrollments')
    .select('id')
    .eq('student_id', targetStudentId)
    .eq('track_id', lesson.track_id)
    .eq('status', 'active')
    .maybeSingle();

  if (enrollmentError || !enrollment) {
    return NextResponse.json(
      { error: 'Active enrollment required for this track' },
      { status: 403 }
    );
  }

  try {
    const result = await gradeSubmission({
      supabase,
      lessonId,
      studentId: targetStudentId,
      tenantId: targetUser.tenant_id,
    });

    return NextResponse.json(
      {
        finding: result.finding,
        aiFindingState: result.aiFindingState,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof MissingAnthropicApiKeyError) {
      return NextResponse.json(
        {
          error:
            'Grading service unavailable: ANTHROPIC_API_KEY is not configured',
        },
        { status: 503 }
      );
    }

    const message =
      error instanceof Error ? error.message : 'Failed to grade submission';

    if (
      message.includes('Control not found') ||
      message.includes('No control_id associated')
    ) {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    if (
      message.includes('Submitted lesson progress not found') ||
      message.includes('Submission payload missing')
    ) {
      return NextResponse.json({ error: message }, { status: 404 });
    }

    console.error('Grading failed:', error);
    return NextResponse.json(
      { error: 'Failed to grade submission' },
      { status: 500 }
    );
  }
}
