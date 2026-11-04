import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, Check, RefreshCw, SwitchCamera } from 'lucide-react';
import { Modal } from '@/components/ui/Overlay';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Feedback';
import { cn } from '@/lib/utils';

type CameraState = { kind: 'starting' } | { kind: 'live' } | { kind: 'captured'; blob: Blob; url: string } | { kind: 'error'; message: string };

export interface CameraCaptureProps {
  open: boolean;
  onClose: () => void;
  /** Receives the captured JPEG. Return an error message to keep the preview (so the user can retake), or null when accepted. */
  onCapture: (blob: Blob) => Promise<string | null>;
  /** Fallback to the phone's own camera app (file input with capture). */
  onUseNativeCamera?: () => void;
  title?: string;
  tip?: string;
  /** Show "Use & take another" for capturing several photos in a row. */
  allowMultiple?: boolean;
}

function cameraErrorMessage(e: unknown) {
  const name = (e as DOMException)?.name;
  if (!window.isSecureContext) return 'The camera only works on a secure (https) connection. Upload a photo from your device instead.';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Camera permission was denied. Allow camera access for this site in your browser settings, or upload a photo from your device instead.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No camera was found on this device. Upload a photo from your device instead.';
  if (name === 'NotReadableError') return 'The camera is being used by another app. Close it and try again.';
  return 'The camera could not be started on this browser.';
}

/**
 * Live camera via MediaDevices. Prefers the rear camera, offers switching when the device has
 * more than one, lets the user retake before keeping a shot, and always stops every camera
 * track when closed, unmounted or when the page is hidden.
 */
export function CameraCapture({ open, onClose, onCapture, onUseNativeCamera, title = 'Take photo', tip, allowMultiple = true }: CameraCaptureProps) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [state, setState] = useState<CameraState>({ kind: 'starting' });
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [cameras, setCameras] = useState(0);
  const [saving, setSaving] = useState(false);
  const [count, setCount] = useState(0);
  const [rejected, setRejected] = useState<string | null>(null);

  const stop = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
  }, []);

  const start = useCallback(async () => {
    stop();
    setState({ kind: 'starting' });
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new DOMException('insecure', 'SecurityError');
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 2560 }, height: { ideal: 1920 } }, audio: false });
      stream.current = s;
      if (video.current) {
        video.current.srcObject = s;
        await video.current.play().catch(() => undefined);
      }
      // Device labels/count are only reliable after permission is granted.
      navigator.mediaDevices
        .enumerateDevices()
        .then((d) => setCameras(d.filter((x) => x.kind === 'videoinput').length))
        .catch(() => setCameras(0));
      setState({ kind: 'live' });
    } catch (e) {
      setState({ kind: 'error', message: cameraErrorMessage(e) });
    }
  }, [facing, stop]);

  useEffect(() => {
    if (!open) return;
    setCount(0);
    setRejected(null);
    void start();
    return stop;
  }, [open, start, stop]);

  // Release the camera if the page is hidden (e.g. phone locked) — restarted on demand.
  useEffect(() => {
    if (!open) return;
    const onHide = () => {
      if (document.visibilityState === 'hidden' && stream.current) {
        stop();
        setState((s) => (s.kind === 'live' || s.kind === 'starting' ? { kind: 'error', message: 'The camera was paused while the page was hidden.' } : s));
      }
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [open, stop]);

  const capture = () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext('2d')!.drawImage(v, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return setState({ kind: 'error', message: 'The photo could not be captured. Please try again.' });
        stop(); // freeze: the preview is the captured still, not the live feed
        setState({ kind: 'captured', blob, url: URL.createObjectURL(blob) });
      },
      'image/jpeg',
      0.92,
    );
  };

  const retake = () => {
    setRejected(null);
    if (state.kind === 'captured') URL.revokeObjectURL(state.url);
    void start();
  };

  const keep = async (another: boolean) => {
    if (state.kind !== 'captured') return;
    setSaving(true);
    try {
      const problem = await onCapture(state.blob);
      setRejected(problem);
      if (problem) return; // keep the preview so the user can retake
      URL.revokeObjectURL(state.url);
      setState({ kind: 'starting' }); // never re-render the revoked preview when reopened
      setCount((c) => c + 1);
      if (another) void start();
      else onClose();
    } finally {
      setSaving(false);
    }
  };

  const close = () => {
    if (state.kind === 'captured') URL.revokeObjectURL(state.url);
    setState({ kind: 'starting' });
    stop();
    onClose();
  };

  return (
    <Modal open={open} onClose={close} title={title} className="sm:max-w-2xl">
      <div className="p-4 sm:p-6">
        <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-charcoal">
          <video ref={video} playsInline muted aria-label="Live camera preview" className={cn('absolute inset-0 size-full object-contain', state.kind !== 'live' && 'invisible')} />
          {state.kind === 'captured' && <img src={state.url} alt="Captured photo preview" className="absolute inset-0 size-full object-contain" />}
          {state.kind === 'starting' && <p className="absolute inset-0 flex items-center justify-center text-sm text-white/80">Starting camera… allow camera access if your browser asks.</p>}
          {state.kind === 'error' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-sm text-white">
              <CameraOff className="size-8 text-gold-300" aria-hidden />
              <p className="max-w-sm">{state.message}</p>
            </div>
          )}
        </div>
        {rejected && (
          <Alert tone="danger" className="mt-3">
            {rejected}
          </Alert>
        )}
        <p className="mt-3 text-xs text-muted">
          {tip ?? 'Tip: photograph the garment flat or on a hanger/mannequin in good daylight, filling the frame.'} {count > 0 && <strong className="text-success">{count} photo(s) added.</strong>}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {state.kind === 'live' && (
            <>
              <Button onClick={capture} icon={<Camera className="size-4" />}>
                Capture
              </Button>
              {cameras > 1 && (
                <Button variant="subtle" icon={<SwitchCamera className="size-4" />} onClick={() => setFacing((f) => (f === 'environment' ? 'user' : 'environment'))}>
                  Switch camera
                </Button>
              )}
            </>
          )}
          {state.kind === 'captured' && (
            <>
              <Button onClick={() => keep(false)} loading={saving} icon={<Check className="size-4" />}>
                Use photo
              </Button>
              {allowMultiple && (
                <Button variant="subtle" onClick={() => keep(true)} disabled={saving}>
                  Use & take another
                </Button>
              )}
              <Button variant="subtle" onClick={retake} disabled={saving} icon={<RefreshCw className="size-4" />}>
                Retake
              </Button>
            </>
          )}
          {state.kind === 'error' && (
            <Button variant="subtle" onClick={() => void start()} icon={<RefreshCw className="size-4" />}>
              Try again
            </Button>
          )}
          <Button variant="ghost" onClick={close} disabled={saving}>
            Cancel
          </Button>
          {onUseNativeCamera && (
            <button
              type="button"
              onClick={() => {
                close();
                onUseNativeCamera();
              }}
              className="ml-auto text-sm font-medium text-copper-600 hover:underline"
            >
              Use phone camera app instead
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

/** Full-screen zoomable image viewer (pinch/scroll on touch, buttons on desktop). */
export function ImageZoom({ open, onClose, src, alt, title }: { open: boolean; onClose: () => void; src: string; alt: string; title?: string }) {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    if (open) setScale(1);
  }, [open, src]);
  return (
    <Modal open={open} onClose={onClose} title={title ?? 'Photo preview'} className="sm:max-w-5xl">
      <div className="p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2 pb-3">
          <Button size="sm" variant="subtle" onClick={() => setScale((s) => Math.max(1, s - 0.5))} disabled={scale <= 1} aria-label="Zoom out">
            −
          </Button>
          <span className="w-14 text-center text-sm tabular-nums" aria-live="polite">
            {Math.round(scale * 100)}%
          </span>
          <Button size="sm" variant="subtle" onClick={() => setScale((s) => Math.min(4, s + 0.5))} disabled={scale >= 4} aria-label="Zoom in">
            +
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setScale(1)} disabled={scale === 1}>
            Fit
          </Button>
        </div>
        <div className="max-h-[75vh] overflow-auto rounded-lg bg-brand-50" data-testid="zoom-viewport">
          <img src={src} alt={alt} style={{ width: `${scale * 100}%`, maxWidth: 'none' }} className="mx-auto block h-auto" />
        </div>
      </div>
    </Modal>
  );
}
