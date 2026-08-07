import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user: authUser },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !authUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = authUser.id;

  const [
    { data: users, error: usersError },
    { data: track_enrollments, error: enrollmentsError },
    { data: lesson_progress, error: progressError },
    { data: oscal_findings, error: findingsError },
  ] = await Promise.all([
    supabase.from('users').select('*').eq('id', userId),
    supabase
      .from('track_enrollments')
      .select('*')
      .eq('student_id', userId),
    supabase.from('lesson_progress').select('*').eq('student_id', userId),
    supabase.from('oscal_findings').select('*').eq('student_id', userId),
  ]);

  const fetchError =
    usersError ?? enrollmentsError ?? progressError ?? findingsError;

  if (fetchError) {
    console.error('account export fetch failed:', fetchError);
    return NextResponse.json(
      { error: 'Failed to export account data' },
      { status: 500 }
    );
  }

  const exportedAt = new Date().toISOString();
  const payload = {
    exportedAt,
    userId,
    users: users ?? [],
    track_enrollments: track_enrollments ?? [],
    lesson_progress: lesson_progress ?? [],
    oscal_findings: oscal_findings ?? [],
  };

  const filename = `cyberskill-account-export-${userId.slice(0, 8)}-${exportedAt.slice(0, 10)}.json`;

  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
