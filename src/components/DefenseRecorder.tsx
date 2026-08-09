'use client';

import { useEffect, useRef, useState } from 'react';
import { Circle, Pause, Square, Video, Mic } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

export type DefensePromptQuestion = {
  id?: string;
  prompt: string;
  focus?: string;
};

export type DefenseRecordingResult = {
  id: string;
  url: string;
  storagePath: string | null;
  mediaType: 'audio' | 'video';
  durationSeconds: number;
  isPublic: boolean;
  mimeType: string;
};

type DefenseRecorderProps = {
  /** Portfolio / finding / ticket id this defense answers. */
  artifactId: string;
  /** Track UUID when known (required for insert; server can also resolve). */
  trackId?: string | null;
  /** Optional oscal_findings.id this defense answers. */
  relatedFindingId?: string | null;
  /**
   * RAG-generated AO / interview questions already produced by capstones
   * (e.g. GRC-10 package → AO review, ISSO AO review). Shown for the student
   * to answer verbally — not graded by speech AI.
   */
  promptQuestions?: DefensePromptQuestion[];
  onSubmitted?: (recording: DefenseRecordingResult) => void;
  className?: string;
};

type Phase = 'idle' | 'recording' | 'preview' | 'uploading' | 'done';

function formatTimer(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function pickMimeType(mediaType: 'audio' | 'video'): string {
  const candidates =
    mediaType === 'video'
      ? ['video/webm;codecs=vp9,opus', 'video/webm', 'video/mp4']
      : ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
  for (const type of candidates) {
    if (
      typeof MediaRecorder !== 'undefined' &&
      MediaRecorder.isTypeSupported(type)
    ) {
      return type;
    }
  }
  return mediaType === 'video' ? 'video/webm' : 'audio/webm';
}

/**
 * Record an audio or video verbal defense (MediaRecorder), preview, then
 * upload to Supabase Storage (`defenses` bucket) and insert defense_recordings.
 */
export function DefenseRecorder({
  artifactId,
  trackId = null,
  relatedFindingId = null,
  promptQuestions = [],
  onSubmitted,
  className,
}: DefenseRecorderProps) {
  const [mediaType, setMediaType] = useState<'audio' | 'video'>('audio');
  const [phase, setPhase] = useState<Phase>('idle');
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isPublic, setIsPublic] = useState(false);
  const [mimeType, setMimeType] = useState('audio/webm');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const blobRef = useRef<Blob | null>(null);
  const videoPreviewRef = useRef<HTMLVideoElement | null>(null);
  const timerRef = useRef<number | null>(null);

  const previewUrlRef = useRef<string | null>(null);
  previewUrlRef.current = previewUrl;

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  function clearTimer() {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  async function startRecording() {
    setError(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    blobRef.current = null;

    try {
      const constraints: MediaStreamConstraints =
        mediaType === 'video'
          ? { audio: true, video: { facingMode: 'user' } }
          : { audio: true };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (mediaType === 'video' && videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = stream;
        void videoPreviewRef.current.play();
      }

      const type = pickMimeType(mediaType);
      setMimeType(type);
      chunksRef.current = [];

      const recorder = new MediaRecorder(stream, { mimeType: type });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type });
        blobRef.current = blob;
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
        setPhase('preview');
        stopStream();
        if (videoPreviewRef.current) {
          videoPreviewRef.current.srcObject = null;
        }
      };

      recorder.start(250);
      setSeconds(0);
      setPhase('recording');
      clearTimer();
      timerRef.current = window.setInterval(() => {
        setSeconds((s) => s + 1);
      }, 1000);
    } catch (err) {
      stopStream();
      setPhase('idle');
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to access microphone/camera. Check browser permissions.'
      );
    }
  }

  function stopRecording() {
    clearTimer();
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    } else {
      setPhase('idle');
      stopStream();
    }
  }

  function discardPreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    blobRef.current = null;
    setSeconds(0);
    setPhase('idle');
  }

  async function confirmUpload() {
    const blob = blobRef.current;
    if (!blob) return;

    setPhase('uploading');
    setError(null);

    const formData = new FormData();
    const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
    formData.append(
      'file',
      new File([blob], `defense.${ext}`, { type: mimeType })
    );
    formData.append('artifactId', artifactId);
    formData.append('mediaType', mediaType);
    formData.append('durationSeconds', String(seconds));
    formData.append('isPublic', String(isPublic));
    formData.append('promptQuestions', JSON.stringify(promptQuestions));
    if (trackId) formData.append('trackId', trackId);
    if (relatedFindingId) formData.append('relatedFindingId', relatedFindingId);

    try {
      const response = await fetch('/api/defenses/upload', {
        method: 'POST',
        body: formData,
        credentials: 'same-origin',
      });
      const payload = (await response.json()) as {
        id?: string;
        url?: string;
        storagePath?: string;
        error?: string;
      };

      if (!response.ok) {
        // Keep local preview when Storage/migration is not applied yet.
        const localUrl = previewUrl ?? URL.createObjectURL(blob);
        const result: DefenseRecordingResult = {
          id: `defense-local-${Date.now()}`,
          url: localUrl,
          storagePath: null,
          mediaType,
          durationSeconds: seconds,
          isPublic,
          mimeType,
        };
        setPhase('done');
        onSubmitted?.(result);
        setError(
          payload.error
            ? `${payload.error} (saved locally for this session)`
            : 'Upload unavailable — saved locally for this session.'
        );
        return;
      }

      const result: DefenseRecordingResult = {
        id: payload.id ?? `defense-${Date.now()}`,
        url: payload.url || previewUrl || URL.createObjectURL(blob),
        storagePath: payload.storagePath ?? null,
        mediaType,
        durationSeconds: seconds,
        isPublic,
        mimeType,
      };
      setPhase('done');
      onSubmitted?.(result);
    } catch {
      const localUrl = previewUrl ?? URL.createObjectURL(blob);
      setPhase('done');
      onSubmitted?.({
        id: `defense-local-${Date.now()}`,
        url: localUrl,
        storagePath: null,
        mediaType,
        durationSeconds: seconds,
        isPublic,
        mimeType,
      });
      setError('Upload unavailable — saved locally for this session.');
    }
  }

  const publicToggleId = `defense-public-${artifactId}`;

  return (
    <div
      className={cn(
        'space-y-4 rounded-lg border border-border bg-muted/20 p-4',
        className
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Verbal defense</h3>
          <p className="text-xs text-muted-foreground">
            Record audio or video answering the questions below, preview, then
            confirm upload. This is record-and-share — not automated speech
            grading.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant={mediaType === 'audio' ? 'default' : 'outline'}
            disabled={phase === 'recording' || phase === 'uploading'}
            onClick={() => setMediaType('audio')}
          >
            <Mic className="size-4" aria-hidden="true" />
            Audio
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mediaType === 'video' ? 'default' : 'outline'}
            disabled={phase === 'recording' || phase === 'uploading'}
            onClick={() => setMediaType('video')}
          >
            <Video className="size-4" aria-hidden="true" />
            Video
          </Button>
        </div>
      </div>

      {promptQuestions.length > 0 ? (
        <ol className="list-decimal space-y-2 rounded-md border border-border bg-card px-4 py-3 pl-8 text-sm">
          {promptQuestions.map((q, index) => (
            <li key={q.id ?? `prompt-${index}`} className="leading-relaxed">
              {q.prompt}
              {q.focus ? (
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  Focus: {q.focus}
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
          No stored AO/interview prompts on this artifact yet. Record a general
          verbal defense of your work, or complete a capstone that generates
          questions first.
        </p>
      )}

      {mediaType === 'video' ? (
        <video
          ref={videoPreviewRef}
          className={cn(
            'aspect-video w-full max-w-md rounded-md border border-border bg-black object-cover',
            phase === 'idle' && !previewUrl && 'hidden'
          )}
          muted={phase === 'recording'}
          playsInline
          controls={phase === 'preview' || phase === 'done'}
          src={
            phase === 'preview' || phase === 'done'
              ? (previewUrl ?? undefined)
              : undefined
          }
        />
      ) : null}

      {mediaType === 'audio' &&
      (phase === 'preview' || phase === 'done') &&
      previewUrl ? (
        <audio controls src={previewUrl} className="w-full max-w-md" />
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        {phase === 'recording' ? (
          <p
            className="inline-flex items-center gap-2 font-mono text-sm tabular-nums text-status-blocked-foreground"
            role="status"
            aria-live="polite"
          >
            <Circle
              className="size-3 animate-pulse fill-current"
              aria-hidden="true"
            />
            Recording {formatTimer(seconds)}
          </p>
        ) : (
          <p className="font-mono text-sm tabular-nums text-muted-foreground">
            {formatTimer(seconds)}
          </p>
        )}

        {phase === 'idle' || phase === 'done' ? (
          <Button type="button" size="sm" onClick={() => void startRecording()}>
            <Circle className="size-3.5 fill-current" aria-hidden="true" />
            Start recording
          </Button>
        ) : null}

        {phase === 'recording' ? (
          <Button
            type="button"
            size="sm"
            variant="destructive"
            onClick={stopRecording}
          >
            <Square className="size-3.5 fill-current" aria-hidden="true" />
            Stop
          </Button>
        ) : null}

        {phase === 'preview' ? (
          <>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={discardPreview}
            >
              <Pause className="size-4" aria-hidden="true" />
              Discard
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => void confirmUpload()}
            >
              Confirm & upload
            </Button>
          </>
        ) : null}

        {phase === 'uploading' ? (
          <p className="text-sm text-muted-foreground">Uploading…</p>
        ) : null}
      </div>

      {(phase === 'preview' || phase === 'done') && (
        <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-card px-4 py-3">
          <div className="space-y-1">
            <Label
              htmlFor={publicToggleId}
              className="text-sm font-medium text-foreground"
            >
              Public portfolio
            </Label>
            <p className="text-sm text-muted-foreground">
              Make this defense visible on your public portfolio page
            </p>
          </div>
          <Switch
            id={publicToggleId}
            checked={isPublic}
            onCheckedChange={setIsPublic}
          />
        </div>
      )}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
