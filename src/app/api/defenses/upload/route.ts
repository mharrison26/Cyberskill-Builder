import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

export const DEFENSES_BUCKET = 'defenses';
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

const ACCEPTED_TYPES = new Set([
  'audio/webm',
  'audio/mp4',
  'audio/mpeg',
  'audio/ogg',
  'video/webm',
  'video/mp4',
  'video/ogg',
]);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type PromptQuestion = {
  id?: string;
  prompt: string;
  focus?: string;
};

function parsePromptQuestions(
  raw: FormDataEntryValue | null
): PromptQuestion[] {
  if (typeof raw !== 'string' || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const questions: PromptQuestion[] = [];
    for (let index = 0; index < parsed.length; index += 1) {
      const item = parsed[index];
      if (typeof item === 'string' && item.trim()) {
        questions.push({ id: `q${index + 1}`, prompt: item.trim() });
        continue;
      }
      if (!item || typeof item !== 'object') continue;
      const row = item as Record<string, unknown>;
      const prompt =
        typeof row.prompt === 'string'
          ? row.prompt.trim()
          : typeof row.question === 'string'
            ? row.question.trim()
            : '';
      if (!prompt) continue;
      questions.push({
        id: typeof row.id === 'string' ? row.id : `q${index + 1}`,
        prompt,
        ...(typeof row.focus === 'string' ? { focus: row.focus } : {}),
      });
    }
    return questions;
  } catch {
    return [];
  }
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

  const { data: appUser } = await supabase
    .from('users')
    .select('id, tenant_id')
    .eq('id', authUser.id)
    .maybeSingle();

  if (!appUser) {
    return NextResponse.json(
      { error: 'User profile not found' },
      { status: 403 }
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const artifactId = formData.get('artifactId');
  const mediaType = formData.get('mediaType');
  const durationRaw = formData.get('durationSeconds');
  const isPublicRaw = formData.get('isPublic');
  const trackIdRaw = formData.get('trackId');
  const relatedFindingRaw = formData.get('relatedFindingId');
  const file = formData.get('file');
  let promptQuestions = parsePromptQuestions(formData.get('promptQuestions'));

  if (typeof artifactId !== 'string' || !artifactId.trim()) {
    return NextResponse.json(
      { error: 'artifactId is required' },
      { status: 400 }
    );
  }
  if (mediaType !== 'audio' && mediaType !== 'video') {
    return NextResponse.json(
      { error: 'mediaType must be audio or video' },
      { status: 400 }
    );
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 });
  }
  if (!ACCEPTED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: 'Unsupported media type.' },
      { status: 400 }
    );
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json(
      { error: 'File must be 50 MB or smaller.' },
      { status: 400 }
    );
  }

  const durationSeconds = Number(durationRaw);
  const isPublic = isPublicRaw === 'true' || isPublicRaw === '1';
  const ext = file.type.includes('mp4')
    ? 'mp4'
    : file.type.includes('ogg')
      ? 'ogg'
      : 'webm';
  const storagePath = `${appUser.tenant_id}/${appUser.id}/${artifactId.trim()}/${Date.now()}.${ext}`;

  // Resolve track / finding / portfolio linkage from owned portfolio_items when possible.
  let portfolioItemId: string | null = null;
  let trackId: string | null =
    typeof trackIdRaw === 'string' && UUID_RE.test(trackIdRaw.trim())
      ? trackIdRaw.trim()
      : null;
  let relatedFindingId: string | null =
    typeof relatedFindingRaw === 'string' &&
    UUID_RE.test(relatedFindingRaw.trim())
      ? relatedFindingRaw.trim()
      : null;

  if (UUID_RE.test(artifactId.trim())) {
    const { data: portfolioItem } = await supabase
      .from('portfolio_items')
      .select('id, track_id, oscal_finding_id, submission')
      .eq('id', artifactId.trim())
      .eq('student_id', appUser.id)
      .maybeSingle();

    if (portfolioItem) {
      portfolioItemId = portfolioItem.id as string;
      trackId = trackId ?? (portfolioItem.track_id as string);
      relatedFindingId =
        relatedFindingId ??
        (portfolioItem.oscal_finding_id as string | null) ??
        null;

      if (promptQuestions.length === 0) {
        const submission =
          (portfolioItem.submission as Record<string, unknown> | null) ?? {};
        promptQuestions = parsePromptQuestions(
          JSON.stringify(submission.questions ?? [])
        );
      }
    }
  }

  if (!trackId) {
    // Fall back to any active enrollment so inserts satisfy NOT NULL track_id.
    const { data: enrollment } = await supabase
      .from('track_enrollments')
      .select('track_id')
      .eq('student_id', appUser.id)
      .eq('status', 'active')
      .order('purchased_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    trackId = (enrollment?.track_id as string | undefined) ?? null;
  }

  if (!trackId) {
    return NextResponse.json(
      { error: 'trackId is required (no portfolio item or enrollment found).' },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await supabase.storage
    .from(DEFENSES_BUCKET)
    .upload(storagePath, buffer, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: recording, error: insertError } = await supabase
    .from('defense_recordings')
    .insert({
      tenant_id: appUser.tenant_id,
      student_id: appUser.id,
      track_id: trackId,
      related_finding_id: relatedFindingId,
      portfolio_item_id: portfolioItemId,
      artifact_id: artifactId.trim(),
      prompt_questions: promptQuestions,
      storage_path: storagePath,
      media_type: mediaType,
      mime_type: file.type,
      duration_seconds: Number.isFinite(durationSeconds)
        ? Math.max(0, Math.round(durationSeconds))
        : 0,
      is_public: isPublic,
    })
    .select(
      'id, storage_path, media_type, duration_seconds, is_public, created_at, prompt_questions'
    )
    .single();

  if (insertError || !recording) {
    return NextResponse.json(
      { error: insertError?.message ?? 'Failed to save defense record' },
      { status: 500 }
    );
  }

  const { data: signed } = await supabase.storage
    .from(DEFENSES_BUCKET)
    .createSignedUrl(storagePath, 60 * 60);

  return NextResponse.json({
    id: recording.id,
    url: signed?.signedUrl ?? '',
    storagePath,
    mediaType: recording.media_type,
    durationSeconds: recording.duration_seconds,
    isPublic: recording.is_public,
    createdAt: recording.created_at,
    promptQuestions: recording.prompt_questions,
  });
}
