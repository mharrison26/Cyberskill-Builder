import { NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

const CONFIRMATION_PHRASE = 'DELETE MY ACCOUNT';

type DeleteRequestBody = {
  confirm?: string;
};

function isUserNotFoundAuthError(error: { message?: string; status?: number }) {
  const message = error.message?.toLowerCase() ?? '';
  return (
    error.status === 404 ||
    message.includes('user not found') ||
    message.includes('not found')
  );
}

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user: authUser },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !authUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: DeleteRequestBody;
  try {
    body = (await request.json()) as DeleteRequestBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (body.confirm !== CONFIRMATION_PHRASE) {
    return NextResponse.json(
      {
        error: `Confirmation required. Send { "confirm": "${CONFIRMATION_PHRASE}" } in the request body.`,
      },
      { status: 400 }
    );
  }

  const userId = authUser.id;

  let admin;
  try {
    admin = createAdminClient();
  } catch (error) {
    console.error('account delete admin client unavailable:', error);
    return NextResponse.json(
      { error: 'Account deletion is not configured on this server' },
      { status: 503 }
    );
  }

  const deleteSteps = [
    {
      table: 'oscal_findings',
      run: () => admin.from('oscal_findings').delete().eq('student_id', userId),
    },
    {
      table: 'lesson_progress',
      run: () =>
        admin.from('lesson_progress').delete().eq('student_id', userId),
    },
    {
      table: 'ticket_progress',
      run: () =>
        admin.from('ticket_progress').delete().eq('student_id', userId),
    },
    {
      table: 'track_enrollments',
      run: () =>
        admin.from('track_enrollments').delete().eq('student_id', userId),
    },
    {
      table: 'users',
      run: () => admin.from('users').delete().eq('id', userId),
    },
  ] as const;

  for (const step of deleteSteps) {
    const { error } = await step.run();
    if (error) {
      console.error(`account delete failed on ${step.table}:`, error);
      return NextResponse.json(
        { error: `Failed to delete account data (${step.table})` },
        { status: 500 }
      );
    }
  }

  const { error: authDeleteError } = await admin.auth.admin.deleteUser(userId);

  if (authDeleteError && !isUserNotFoundAuthError(authDeleteError)) {
    console.error('account delete auth.users failed:', authDeleteError);
    return NextResponse.json(
      {
        error:
          'Application data was deleted but the auth account could not be removed. Contact support.',
      },
      { status: 500 }
    );
  }

  await supabase.auth.signOut();

  return NextResponse.json({
    success: true,
    deletedAt: new Date().toISOString(),
    userId,
  });
}
