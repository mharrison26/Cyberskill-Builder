import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createClientMock,
  createAdminClientMock,
  enqueueGradingMock,
  kickGradingWorkerMock,
  scheduleGradingWorkerMock,
  processGradingJobsMock,
} = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  createAdminClientMock: vi.fn(),
  enqueueGradingMock: vi.fn(),
  kickGradingWorkerMock: vi.fn(),
  scheduleGradingWorkerMock: vi.fn(),
  processGradingJobsMock: vi.fn(),
}));

vi.mock('@vercel/functions', () => ({
  waitUntil: vi.fn((promise: Promise<unknown>) => {
    void promise;
  }),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: createClientMock,
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: createAdminClientMock,
}));

vi.mock('@/lib/grading/enqueueGrading', () => ({
  enqueueGrading: enqueueGradingMock,
  kickGradingWorker: kickGradingWorkerMock,
}));

vi.mock('@/lib/grading/scheduleGradingWorker', () => ({
  scheduleGradingWorker: scheduleGradingWorkerMock,
}));

vi.mock('@/lib/grading/processGradingJobs', () => ({
  processGradingJobs: processGradingJobsMock,
}));

import { POST } from '@/app/api/lessons/[lessonId]/grade/route';

const LESSON_ID = '11111111-1111-4111-8111-111111111111';
const ADMIN_ID = '22222222-2222-4222-8222-222222222222';
const STUDENT_ID = '33333333-3333-4333-8333-333333333333';
const PROGRESS_ID = '44444444-4444-4444-8444-444444444444';

function mockClients(options: {
  authUserId: string;
  isAdmin: boolean;
  targetStudentId?: string;
}) {
  const targetStudentId = options.targetStudentId ?? options.authUserId;

  const getUser = vi.fn().mockResolvedValue({
    data: { user: { id: options.authUserId } },
    error: null,
  });

  const appUserMaybeSingle = vi.fn().mockResolvedValue({
    data: {
      id: options.authUserId,
      tenant_id: 'tenant-1',
      email: 'admin@example.com',
      is_admin: options.isAdmin,
    },
    error: null,
  });

  const targetUserMaybeSingle = vi.fn().mockResolvedValue({
    data: { id: targetStudentId, tenant_id: 'tenant-1' },
    error: null,
  });

  const lessonMaybeSingle = vi.fn().mockResolvedValue({
    data: { id: LESSON_ID, track_id: 'track-1', dcwf_code: 'OV-LGA-001' },
    error: null,
  });

  const enrollmentMaybeSingle = vi.fn().mockResolvedValue({
    data: { id: 'enroll-1' },
    error: null,
  });

  const progressMaybeSingle = vi.fn().mockResolvedValue({
    data: {
      id: PROGRESS_ID,
      student_id: targetStudentId,
      lesson_id: LESSON_ID,
      status: 'submitted',
      submission: { type: 'conceptual', memo: 'x'.repeat(120) },
    },
    error: null,
  });

  function lessonProgressApi() {
    const chain: {
      eq: ReturnType<typeof vi.fn>;
      maybeSingle: typeof progressMaybeSingle;
    } = {
      eq: vi.fn(),
      maybeSingle: progressMaybeSingle,
    };
    chain.eq.mockReturnValue(chain);
    return {
      select: vi.fn().mockReturnValue(chain),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    };
  }

  let usersCalls = 0;
  const from = vi.fn((table: string) => {
    if (table === 'users') {
      usersCalls += 1;
      if (usersCalls === 1) {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({ maybeSingle: appUserMaybeSingle }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({ maybeSingle: targetUserMaybeSingle }),
        }),
      };
    }
    if (table === 'lessons') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({ maybeSingle: lessonMaybeSingle }),
        }),
      };
    }
    if (table === 'track_enrollments') {
      const eq3 = vi
        .fn()
        .mockReturnValue({ maybeSingle: enrollmentMaybeSingle });
      const eq2 = vi.fn().mockReturnValue({ eq: eq3 });
      const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
      return {
        select: vi.fn().mockReturnValue({ eq: eq1 }),
      };
    }
    if (table === 'lesson_progress') {
      return lessonProgressApi();
    }
    throw new Error(`Unexpected table ${table}`);
  });

  createClientMock.mockResolvedValue({
    auth: { getUser },
    from,
  });

  createAdminClientMock.mockReturnValue({
    from: lessonProgressApi,
  });
}

describe('POST /api/lessons/[lessonId]/grade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.GRADING_PROCESS_INLINE;
    enqueueGradingMock.mockResolvedValue({
      status: 'queued',
      progressId: PROGRESS_ID,
    });
    kickGradingWorkerMock.mockResolvedValue({ ok: true });
    scheduleGradingWorkerMock.mockResolvedValue(undefined);
    processGradingJobsMock.mockResolvedValue({
      timedOut: 0,
      processed: 0,
      succeeded: 0,
      failed: 0,
      retried: 0,
      alerted: 0,
      skipped: 0,
    });
  });

  it('enqueues grading and schedules the worker for the learner', async () => {
    mockClients({ authUserId: STUDENT_ID, isAdmin: false });

    const request = new Request('http://localhost', {
      method: 'POST',
      body: '{}',
    });
    const response = await POST(request, {
      params: { lessonId: LESSON_ID },
    });
    const payload = await response.json();

    expect(response.status).toBe(202);
    expect(payload.grading?.status).toBe('queued');
    expect(enqueueGradingMock).toHaveBeenCalledWith(
      expect.objectContaining({
        progressId: PROGRESS_ID,
        studentId: STUDENT_ID,
        lessonId: LESSON_ID,
      })
    );
    expect(scheduleGradingWorkerMock).toHaveBeenCalledWith(
      PROGRESS_ID,
      request
    );
    expect(processGradingJobsMock).not.toHaveBeenCalled();
  });

  it('runs grading inline for admin re-run with inline:true', async () => {
    mockClients({
      authUserId: ADMIN_ID,
      isAdmin: true,
      targetStudentId: STUDENT_ID,
    });
    processGradingJobsMock.mockResolvedValue({
      timedOut: 0,
      processed: 1,
      succeeded: 1,
      failed: 0,
      retried: 0,
      alerted: 0,
      skipped: 0,
    });

    const response = await POST(
      new Request('https://cyberskill-builder.vercel.app', {
        method: 'POST',
        body: JSON.stringify({ studentId: STUDENT_ID, inline: true }),
      }),
      {
        params: { lessonId: LESSON_ID },
      }
    );
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.grading?.status).toBe('completed');
    expect(createAdminClientMock).toHaveBeenCalled();
    expect(kickGradingWorkerMock).toHaveBeenCalledWith(
      expect.objectContaining({ progressId: PROGRESS_ID })
    );
    expect(processGradingJobsMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ progressId: PROGRESS_ID, limit: 1 })
    );
    expect(scheduleGradingWorkerMock).not.toHaveBeenCalled();
  });

  it('returns queued when inline misses but worker kick succeeds', async () => {
    mockClients({
      authUserId: ADMIN_ID,
      isAdmin: true,
      targetStudentId: STUDENT_ID,
    });

    const response = await POST(
      new Request('https://cyberskill-builder.vercel.app', {
        method: 'POST',
        body: JSON.stringify({ studentId: STUDENT_ID, inline: true }),
      }),
      {
        params: { lessonId: LESSON_ID },
      }
    );
    const payload = await response.json();

    expect(response.status).toBe(202);
    expect(payload.grading?.status).toBe('queued');
    expect(payload.message).toMatch(/worker kicked/i);
    expect(scheduleGradingWorkerMock).not.toHaveBeenCalled();
  });

  it('returns an error when admin inline re-run and kick both fail', async () => {
    mockClients({
      authUserId: ADMIN_ID,
      isAdmin: true,
      targetStudentId: STUDENT_ID,
    });
    kickGradingWorkerMock.mockResolvedValue({
      ok: false,
      error: 'No app origin available to kick grading worker',
    });

    const response = await POST(
      new Request('https://cyberskill-builder.vercel.app', {
        method: 'POST',
        body: JSON.stringify({ studentId: STUDENT_ID, inline: true }),
      }),
      {
        params: { lessonId: LESSON_ID },
      }
    );
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload.grading?.status).toBe('failed');
    expect(payload.error).toMatch(/did not claim/i);
    expect(scheduleGradingWorkerMock).not.toHaveBeenCalled();
  });

  it('rejects invalid lesson ids before touching the database', async () => {
    const response = await POST(
      new Request('http://localhost', { method: 'POST', body: '{}' }),
      {
        params: { lessonId: 'not-a-uuid' },
      }
    );

    expect(response.status).toBe(400);
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated callers', async () => {
    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi
          .fn()
          .mockResolvedValue({ data: { user: null }, error: null }),
      },
      from: vi.fn(),
    });

    const response = await POST(
      new Request('http://localhost', { method: 'POST', body: '{}' }),
      {
        params: { lessonId: LESSON_ID },
      }
    );

    expect(response.status).toBe(401);
    expect(enqueueGradingMock).not.toHaveBeenCalled();
  });
});
