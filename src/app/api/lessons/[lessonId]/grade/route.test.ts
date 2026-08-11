import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createClientMock,
  createAdminClientMock,
  enqueueGradingMock,
  scheduleGradingWorkerMock,
  processGradingJobsMock,
} = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  createAdminClientMock: vi.fn(),
  enqueueGradingMock: vi.fn(),
  scheduleGradingWorkerMock: vi.fn(),
  processGradingJobsMock: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: createClientMock,
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: createAdminClientMock,
}));

vi.mock('@/lib/grading/enqueueGrading', () => ({
  enqueueGrading: enqueueGradingMock,
}));

vi.mock('@/lib/grading/scheduleGradingWorker', () => ({
  scheduleGradingWorker: scheduleGradingWorkerMock,
}));

vi.mock('@/lib/grading/processGradingJobs', () => ({
  processGradingJobs: processGradingJobsMock,
}));

import { POST } from '@/app/api/lessons/[lessonId]/grade/route';

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
    data: { id: 'lesson-1', track_id: 'track-1', dcwf_code: 'OV-LGA-001' },
    error: null,
  });

  const enrollmentMaybeSingle = vi.fn().mockResolvedValue({
    data: { id: 'enroll-1' },
    error: null,
  });

  const progressMaybeSingle = vi.fn().mockResolvedValue({
    data: {
      id: 'progress-1',
      student_id: targetStudentId,
      lesson_id: 'lesson-1',
      status: 'submitted',
      submission: { type: 'conceptual', memo: 'x'.repeat(120) },
    },
    error: null,
  });

  function lessonProgressApi() {
    const eq3 = vi.fn().mockReturnValue({ maybeSingle: progressMaybeSingle });
    const eq2 = vi.fn().mockReturnValue({ eq: eq3 });
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
    return {
      select: vi.fn().mockReturnValue({ eq: eq1 }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    };
  }

  let usersCalls = 0;
  const from = vi.fn((table: string) => {
    if (table === 'users') {
      usersCalls += 1;
      const maybeSingle =
        usersCalls === 1 ? appUserMaybeSingle : targetUserMaybeSingle;
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle,
          }),
        }),
      };
    }
    if (table === 'lessons') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: lessonMaybeSingle,
          }),
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
      progressId: 'progress-1',
    });
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
    mockClients({ authUserId: 'user-1', isAdmin: false });

    const response = await POST(
      new Request('http://localhost', { method: 'POST', body: '{}' }),
      {
        params: { lessonId: 'lesson-1' },
      }
    );
    const payload = await response.json();

    expect(response.status).toBe(202);
    expect(payload.grading?.status).toBe('queued');
    expect(enqueueGradingMock).toHaveBeenCalledWith(
      expect.objectContaining({
        progressId: 'progress-1',
        studentId: 'user-1',
        lessonId: 'lesson-1',
      })
    );
    expect(scheduleGradingWorkerMock).toHaveBeenCalledWith('progress-1');
    expect(processGradingJobsMock).not.toHaveBeenCalled();
  });

  it('runs grading inline for admin re-run with inline:true', async () => {
    mockClients({
      authUserId: 'admin-1',
      isAdmin: true,
      targetStudentId: 'student-1',
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
      new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({ studentId: 'student-1', inline: true }),
      }),
      {
        params: { lessonId: 'lesson-1' },
      }
    );
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.grading?.status).toBe('completed');
    expect(createAdminClientMock).toHaveBeenCalled();
    expect(processGradingJobsMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ progressId: 'progress-1', limit: 1 })
    );
    expect(scheduleGradingWorkerMock).not.toHaveBeenCalled();
  });

  it('returns an error when admin inline re-run does not process the job', async () => {
    mockClients({
      authUserId: 'admin-1',
      isAdmin: true,
      targetStudentId: 'student-1',
    });

    const response = await POST(
      new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({ studentId: 'student-1', inline: true }),
      }),
      {
        params: { lessonId: 'lesson-1' },
      }
    );
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload.grading?.status).toBe('failed');
    expect(payload.error).toMatch(/did not claim or process/i);
    expect(scheduleGradingWorkerMock).not.toHaveBeenCalled();
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
        params: { lessonId: 'lesson-1' },
      }
    );

    expect(response.status).toBe(401);
    expect(enqueueGradingMock).not.toHaveBeenCalled();
  });
});
