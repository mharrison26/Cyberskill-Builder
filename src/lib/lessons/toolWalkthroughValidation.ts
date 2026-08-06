export const TOOL_WALKTHROUGH_MIN_REFLECTION_LENGTH = 20;

export const LESSON_SUBMISSIONS_BUCKET = 'lesson-submissions';

const ALLOWED_IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif']);

export type ToolWalkthroughSubmission = {
  type: 'tool_walkthrough';
  storagePath: string;
  externalReference: string;
  reflection: string;
  uploadedAt: string;
};

export function sanitizeSubmissionFilename(filename: string): string {
  const base = filename.split(/[/\\]/).pop() ?? 'upload';
  const sanitized = base.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_+/g, '_');
  return sanitized.slice(0, 200) || 'upload';
}

export function buildLessonSubmissionStoragePath(
  tenantId: string,
  studentId: string,
  lessonId: string,
  filename: string
): string {
  return `${tenantId}/${studentId}/${lessonId}/${sanitizeSubmissionFilename(filename)}`;
}

export function isAllowedLessonSubmissionPath(
  storagePath: string,
  context: { tenantId: string; studentId: string; lessonId: string }
): boolean {
  const segments = storagePath.split('/').filter(Boolean);
  if (segments.length !== 4) return false;

  const [tenantId, studentId, lessonId, filename] = segments;
  if (
    tenantId !== context.tenantId ||
    studentId !== context.studentId ||
    lessonId !== context.lessonId
  ) {
    return false;
  }

  const extension = filename.split('.').pop()?.toLowerCase() ?? '';
  return ALLOWED_IMAGE_EXTENSIONS.has(extension);
}

export function validateToolWalkthroughSubmission(
  body: unknown,
  context: { tenantId: string; studentId: string; lessonId: string }
):
  { ok: true; data: ToolWalkthroughSubmission } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Request body must be a JSON object.' };
  }

  const record = body as Record<string, unknown>;

  if (record.type !== 'tool_walkthrough') {
    return { ok: false, error: 'Submission type must be tool_walkthrough.' };
  }

  if (typeof record.storagePath !== 'string' || !record.storagePath.trim()) {
    return { ok: false, error: 'Evidence upload is required.' };
  }

  const storagePath = record.storagePath.trim();
  if (!isAllowedLessonSubmissionPath(storagePath, context)) {
    return {
      ok: false,
      error: 'Storage path must match your tenant, student, and lesson scope.',
    };
  }

  if (typeof record.externalReference !== 'string') {
    return { ok: false, error: 'External reference must be text.' };
  }

  const externalReference = record.externalReference.trim();
  if (!externalReference) {
    return { ok: false, error: 'External reference is required.' };
  }

  if (typeof record.reflection !== 'string') {
    return { ok: false, error: 'Reflection is required.' };
  }

  const reflection = record.reflection.trim();
  if (!reflection) {
    return { ok: false, error: 'Reflection is required.' };
  }

  if (reflection.length < TOOL_WALKTHROUGH_MIN_REFLECTION_LENGTH) {
    return {
      ok: false,
      error: `Reflection must be at least ${TOOL_WALKTHROUGH_MIN_REFLECTION_LENGTH} characters.`,
    };
  }

  const uploadedAt =
    typeof record.uploadedAt === 'string' && record.uploadedAt.trim()
      ? record.uploadedAt.trim()
      : new Date().toISOString();

  return {
    ok: true,
    data: {
      type: 'tool_walkthrough',
      storagePath,
      externalReference,
      reflection,
      uploadedAt,
    },
  };
}
