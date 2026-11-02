import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Camera, CameraOff, Check, ImagePlus, RefreshCw, Star, SwitchCamera, Trash2, Upload, X } from 'lucide-react';
import { IMAGE_USAGE_RIGHTS } from '@dhaaga/shared';
import { api, errorMessage } from '@/lib/api';
import { liveCameraSupported, preparePhoto, PHOTO_RULES, type PreparedPhoto } from '@/lib/photos';
import { Panel } from '@/components/dashboard/DashboardLayout';
import { Alert, StatusBadge } from '@/components/ui/Feedback';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Overlay';
import { useConfirmDialog } from '@/components/ui/ConfirmDialog';
import { cn } from '@/lib/utils';
import { toast } from '@/stores/ui';

export interface ProductPhoto {
  id: string;
  url: string;
  usageRights: string;
  attribution: string | null;
  status: string;
  width?: number | null;
  height?: number | null;
}

const MAX_PHOTOS = 12;
const MAX_PER_UPLOAD = 8;

type CameraState = { kind: 'starting' } | { kind: 'live' } | { kind: 'captured'; blob: Blob; url: string } | { kind: 'error'; message: string };

/**
 * Live camera via MediaDevices. Prefers the rear camera, lets the supplier retake before
 * keeping a shot, and always stops the camera stream when closed.
 */
function CameraCapture({ open, onClose, onCapture, onUseNativeCamera }: { open: boolean; onClose: () => void; onCapture: (blob: Blob) => Promise<string | null>; onUseNativeCamera: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [state, setState] = useState<CameraState>({ kind: 'starting' });
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
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
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 2560 }, height: { ideal: 1920 } }, audio: false });
      stream.current = s;
      if (video.current) {
        video.current.srcObject = s;
        await video.current.play().catch(() => undefined);
      }
      setState({ kind: 'live' });
    } catch (e) {
      const name = (e as DOMException)?.name;
      const message =
        name === 'NotAllowedError' || name === 'SecurityError'
          ? 'Camera permission was denied. Allow camera access for this site in your browser settings, or upload a photo from your device instead.'
          : name === 'NotFoundError' || name === 'OverconstrainedError'
            ? 'No camera was found on this device. Upload a photo from your device instead.'
            : name === 'NotReadableError'
              ? 'The camera is being used by another app. Close it and try again.'
              : 'The camera could not be started on this browser.';
      setState({ kind: 'error', message });
    }
  }, [facing, stop]);

  useEffect(() => {
    if (!open) return;
    setCount(0);
    void start();
    return stop;
  }, [open, start, stop]);

  // Release the camera if the page is hidden (e.g. phone locked) — restarted on demand.
  useEffect(() => {
    if (!open) return;
    const onHide = () => document.visibilityState === 'hidden' && stop();
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
      if (problem) return; // keep the preview so the supplier can retake
      URL.revokeObjectURL(state.url);
      setCount((c) => c + 1);
      if (another) void start();
      else onClose();
    } finally {
      setSaving(false);
    }
  };

  const close = () => {
    if (state.kind === 'captured') URL.revokeObjectURL(state.url);
    stop();
    onClose();
  };

  return (
    <Modal open={open} onClose={close} title="Take product photo" className="sm:max-w-2xl">
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
          Tip: photograph the garment flat or on a hanger/mannequin in good daylight, filling the frame. {count > 0 && <strong className="text-success">{count} photo(s) added.</strong>}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {state.kind === 'live' && (
            <>
              <Button onClick={capture} icon={<Camera className="size-4" />}>
                Capture
              </Button>
              <Button variant="subtle" icon={<SwitchCamera className="size-4" />} onClick={() => setFacing((f) => (f === 'environment' ? 'user' : 'environment'))}>
                Switch camera
              </Button>
            </>
          )}
          {state.kind === 'captured' && (
            <>
              <Button onClick={() => keep(false)} loading={saving} icon={<Check className="size-4" />}>
                Use photo
              </Button>
              <Button variant="subtle" onClick={() => keep(true)} disabled={saving}>
                Use & take another
              </Button>
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
          <button type="button" onClick={() => { close(); onUseNativeCamera(); }} className="ml-auto text-sm font-medium text-copper-600 hover:underline">
            Use phone camera app instead
          </button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Product photos: take with the camera or upload from the device, preview and remove before
 * uploading, then reorder and choose the primary photo. Photos are the supplier's own and are
 * reviewed before the listing goes live.
 */
export function ProductPhotos({ productId, photos, canSubmit }: { productId: string; photos: ProductPhoto[]; canSubmit: boolean }) {
  const qc = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const captureInput = useRef<HTMLInputElement>(null);
  const [staged, setStaged] = useState<PreparedPhoto[]>([]);
  const [problems, setProblems] = useState<string[]>([]);
  const [rights, setRights] = useState('');
  const [attribution, setAttribution] = useState('');
  const [camera, setCamera] = useState(false);
  const [order, setOrder] = useState<ProductPhoto[]>(photos);
  const [dragId, setDragId] = useState<string | null>(null);
  const { confirm, element: confirmElement } = useConfirmDialog();
  const refresh = () => qc.invalidateQueries({ queryKey: ['supplier', 'product', productId] });

  useEffect(() => setOrder(photos), [photos]);
  // Free preview memory for staged photos when leaving the page.
  const stagedRef = useRef(staged);
  stagedRef.current = staged;
  useEffect(() => () => stagedRef.current.forEach((p) => URL.revokeObjectURL(p.previewUrl)), []);

  const room = MAX_PHOTOS - photos.length - staged.length;

  const addFiles = async (files: (File | Blob)[], source: PreparedPhoto['source']) => {
    const errs: string[] = [];
    const ok: PreparedPhoto[] = [];
    const accepted = files.slice(0, Math.max(0, room));
    if (files.length > accepted.length) errs.push(`A listing can have up to ${MAX_PHOTOS} photos — ${files.length - accepted.length} photo(s) were not added.`);
    for (const f of accepted) {
      try {
        ok.push(await preparePhoto(f, source));
      } catch (e) {
        errs.push((e as Error).message);
      }
    }
    setStaged((s) => [...s, ...ok]);
    setProblems(errs);
    return errs[0] ?? null;
  };

  const upload = useMutation({
    mutationFn: async (batch: PreparedPhoto[]) => {
      for (let i = 0; i < batch.length; i += MAX_PER_UPLOAD) {
        const fd = new FormData();
        batch.slice(i, i + MAX_PER_UPLOAD).forEach((p) => fd.append('images', p.file, p.file.name));
        fd.append('usageRights', rights);
        if (attribution) fd.append('attribution', attribution);
        await api.post(`/supplier/products/${productId}/images`, fd);
      }
    },
    onSuccess: (_d, batch) => {
      batch.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      setStaged([]);
      toast({ tone: 'success', title: `${batch.length} photo(s) uploaded`, description: 'They will be reviewed with your listing.' });
      void refresh();
    },
    onError: (e) => toast({ tone: 'error', title: 'Upload failed', description: errorMessage(e) }),
  });

  const saveOrder = useMutation({
    mutationFn: (ids: string[]) => api.put(`/supplier/products/${productId}/images/order`, { imageIds: ids }),
    onSuccess: () => void refresh(),
    onError: (e) => {
      setOrder(photos);
      toast({ tone: 'error', title: 'Could not save the photo order', description: errorMessage(e) });
    },
  });

  const remove = useMutation({
    mutationFn: (imageId: string) => api.delete(`/supplier/products/${productId}/images/${imageId}`),
    onSuccess: () => {
      toast({ tone: 'success', title: 'Photo removed' });
      void refresh();
    },
    onError: (e) => toast({ tone: 'error', title: errorMessage(e) }),
  });

  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length || from === to) return;
    const next = [...order];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setOrder(next);
    saveOrder.mutate(next.map((p) => p.id));
  };

  const openCamera = () => {
    if (liveCameraSupported()) setCamera(true);
    else captureInput.current?.click(); // phones without MediaDevices: native camera via capture input
  };

  const rightsOk = !!rights && (rights !== 'LICENSED' || !!attribution.trim());

  return (
    <Panel title="Product photos">
      {confirmElement}
      <p className="mb-4 text-sm text-muted">
        Use your own photos of this product — JPEG, PNG or WebP, at least {PHOTO_RULES.minSide}px on the shortest side. Large camera photos are resized on your device to {PHOTO_RULES.maxSide}px so fabric detail stays sharp. The first photo is the main photo retailers see. Photos are reviewed before the listing goes live.
      </p>

      {order.length > 0 && (
        <>
          <h3 className="mb-2 text-sm font-semibold">
            Uploaded photos <span className="font-normal text-muted">· drag to reorder, or use the arrows</span>
          </h3>
          <ul className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-label="Uploaded photos">
            {order.map((img, i) => (
              <li
                key={img.id}
                draggable
                onDragStart={() => setDragId(img.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  const from = order.findIndex((p) => p.id === dragId);
                  if (from >= 0) move(from, i);
                  setDragId(null);
                }}
                className={cn('overflow-hidden rounded-lg border bg-white', i === 0 ? 'border-copper-500 ring-2 ring-copper-500/30' : 'border-line', dragId === img.id && 'opacity-50')}
              >
                <div className="relative aspect-square cursor-grab bg-brand-50 active:cursor-grabbing">
                  <img src={img.url} alt={`Product photo ${i + 1}`} className="absolute inset-0 size-full object-cover" draggable={false} />
                  {i === 0 && (
                    <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 rounded-full bg-copper-600 px-2 py-0.5 text-[0.6875rem] font-semibold text-white">
                      <Star className="size-3 fill-current" aria-hidden /> Primary
                    </span>
                  )}
                  <StatusBadge status={img.status} label={img.status === 'PENDING' ? 'In review' : img.status === 'ACCEPTED' ? 'Approved' : 'Rejected'} className="absolute bottom-1.5 left-1.5" />
                </div>
                <div className="flex items-center gap-1 p-1.5">
                  <button type="button" onClick={() => move(i, i - 1)} disabled={i === 0} className="rounded p-1.5 text-muted hover:bg-brand-50 hover:text-charcoal disabled:opacity-30" aria-label={`Move photo ${i + 1} earlier`}>
                    <ArrowLeft className="size-4" />
                  </button>
                  <button type="button" onClick={() => move(i, i + 1)} disabled={i === order.length - 1} className="rounded p-1.5 text-muted hover:bg-brand-50 hover:text-charcoal disabled:opacity-30" aria-label={`Move photo ${i + 1} later`}>
                    <ArrowRight className="size-4" />
                  </button>
                  {i !== 0 && (
                    <button type="button" onClick={() => move(i, 0)} className="rounded px-1.5 py-1 text-xs font-medium text-copper-600 hover:bg-brand-50" aria-label={`Make photo ${i + 1} the primary photo`}>
                      Set primary
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={async () => {
                      if (await confirm({ title: 'Remove this photo?', body: 'It is deleted from the listing. This cannot be undone.', confirmLabel: 'Remove photo', tone: 'danger' })) remove.mutate(img.id);
                    }}
                    className="ml-auto rounded p-1.5 text-muted hover:bg-danger-bg hover:text-danger"
                    aria-label={`Remove photo ${i + 1}`}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="rounded-lg border border-dashed border-line-strong bg-ivory-light p-4 sm:p-5">
        <h3 className="text-sm font-semibold">Add photos</h3>
        <p className="mt-0.5 text-xs text-muted">{room > 0 ? `You can add ${room} more photo(s).` : `This listing has the maximum of ${MAX_PHOTOS} photos.`}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" icon={<Camera className="size-4" />} onClick={openCamera} disabled={room <= 0}>
            Take Photo
          </Button>
          <Button type="button" variant="outline" icon={<ImagePlus className="size-4" />} onClick={() => fileInput.current?.click()} disabled={room <= 0}>
            Upload from Device
          </Button>
        </div>
        {/* Gallery / file picker (multiple). */}
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          data-testid="photo-file-input"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = '';
            if (files.length) void addFiles(files, 'device');
          }}
        />
        {/* Native camera capture — opens the rear camera directly on phones. */}
        <input
          ref={captureInput}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          data-testid="photo-capture-input"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = '';
            if (files.length) void addFiles(files, 'camera');
          }}
        />

        {problems.length > 0 && (
          <Alert tone="danger" className="mt-4" title="Some photos were not added">
            <ul className="list-disc pl-4">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </Alert>
        )}

        {staged.length > 0 && (
          <div className="mt-4">
            <h4 className="mb-2 text-sm font-semibold">Ready to upload ({staged.length})</h4>
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6" aria-label="Photos ready to upload">
              {staged.map((p) => (
                <li key={p.id} className="relative overflow-hidden rounded-lg border border-line bg-white">
                  <img src={p.previewUrl} alt={`Preview of ${p.file.name}`} className="aspect-square w-full object-cover" />
                  <span className="block truncate px-1.5 py-1 text-[0.625rem] text-muted">
                    {p.source === 'camera' ? 'Camera' : 'Device'} · {p.width}×{p.height}
                    {p.resized ? ' · resized' : ''}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      URL.revokeObjectURL(p.previewUrl);
                      setStaged((s) => s.filter((x) => x.id !== p.id));
                    }}
                    className="absolute top-1 right-1 rounded-full bg-white/95 p-1 text-danger shadow"
                    aria-label={`Remove ${p.file.name} before uploading`}
                  >
                    <X className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Select label="Who owns these photos?" value={rights} onChange={(e) => setRights(e.target.value)} required>
                <option value="">Choose…</option>
                {IMAGE_USAGE_RIGHTS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </Select>
              {rights === 'LICENSED' && <Input label="Attribution / licence reference" value={attribution} onChange={(e) => setAttribution(e.target.value)} required />}
            </div>
            <Button className="mt-4" icon={<Upload className="size-4" />} onClick={() => upload.mutate(staged)} loading={upload.isPending} disabled={!rightsOk}>
              Upload {staged.length} photo{staged.length === 1 ? '' : 's'}
            </Button>
            {!rightsOk && <p className="mt-2 text-xs text-muted">Confirm who owns the photos to upload them.</p>}
          </div>
        )}
      </div>
      {!canSubmit && <p className="mt-3 text-xs text-muted">Listings can be submitted for review once your supplier application has been submitted.</p>}

      <CameraCapture
        open={camera}
        onClose={() => setCamera(false)}
        onUseNativeCamera={() => captureInput.current?.click()}
        onCapture={(blob) => addFiles([new File([blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' })], 'camera')}
      />
    </Panel>
  );
}
