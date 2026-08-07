import { NextResponse } from 'next/server';

import { scanUpload } from '@/lib/compliance/scanUpload';
import {
  buildLessonSubmissionStoragePath,
  LESSON_SUBMISSIONS_BUCKET,
} from '@/lib/lessons/toolWalkthroughValidation';
import { resolveSubmitLessonContext } from '@/lib/lessons/submitLessonContext';
import { createClient } from '@/lib/supabase/server';

const ACCEPTED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

export async function POST(request: Request) {
  const supabase = await createClient();

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const lessonId = formData.get('lessonId');
  const file = formData.get('file');

  if (typeof lessonId !== 'string' || !lessonId.trim()) {
    return NextResponse.json(
      { error: 'lessonId is required' },
      { status: 400 }
    );
  }

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 });
  }

  if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: 'File must be JPEG, PNG, WebP, or GIF.' },
      { status: 400 }
    );
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json(
      { error: 'File must be 5 MB or smaller.' },
      { status: 400 }
    );
  }

  const resolved = await resolveSubmitLessonContext(supabase, lessonId.trim());
  if (!resolved.ok) {
    return resolved.response;
  }

  const { context } = resolved;
  const buffer = Buffer.from(await file.arrayBuffer());
  const scanResult = scanUpload({
    filename: file.name,
    mimeType: file.type,
    size: file.size,
    buffer,
  });

  if (!scanResult.ok) {
    return NextResponse.json({ error: scanResult.error }, { status: 422 });
  }

  const storagePath = buildLessonSubmissionStoragePath(
    context.appUser.tenant_id,
    context.appUser.id,
    lessonId.trim(),
    file.name
  );

  const { error: uploadError } = await supabase.storage
    .from(LESSON_SUBMISSIONS_BUCKET)
    .upload(storagePath, buffer, {
      upsert: true,
      contentType: file.type,
    });

  if (uploadError) {
    console.error('lesson submission upload failed:', uploadError);
    return NextResponse.json(
      { error: 'Failed to upload evidence file' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    storagePath,
    uploadedAt: new Date().toISOString(),
  });
}
