import type { SupabaseClient } from '@supabase/supabase-js';

import { scanUpload } from '@/lib/compliance/scanUpload';
import { LESSON_SUBMISSIONS_BUCKET } from '@/lib/lessons/toolWalkthroughValidation';

export async function scanStoredLessonSubmission(
  supabase: SupabaseClient,
  storagePath: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const filename = storagePath.split('/').pop() ?? storagePath;

  const { data, error } = await supabase.storage
    .from(LESSON_SUBMISSIONS_BUCKET)
    .download(storagePath);

  if (error || !data) {
    return {
      ok: false,
      error: 'Uploaded evidence file could not be verified.',
    };
  }

  const buffer = Buffer.from(await data.arrayBuffer());
  const scanResult = scanUpload({
    filename,
    mimeType: data.type || 'application/octet-stream',
    size: buffer.byteLength,
    buffer,
  });

  if (!scanResult.ok) {
    await supabase.storage.from(LESSON_SUBMISSIONS_BUCKET).remove([storagePath]);
    return { ok: false, error: scanResult.error };
  }

  return { ok: true };
}
