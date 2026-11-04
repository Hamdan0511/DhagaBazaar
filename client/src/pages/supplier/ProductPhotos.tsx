import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Camera, ImagePlus, Maximize2, Replace, Sparkles, Star, Trash2, Upload, X } from 'lucide-react';
import { IMAGE_USAGE_RIGHTS } from '@dhaaga/shared';
import { api, errorMessage } from '@/lib/api';
import { liveCameraSupported, preparePhoto, PHOTO_RULES, type PreparedPhoto } from '@/lib/photos';
import { Panel } from '@/components/dashboard/DashboardLayout';
import { Alert, StatusBadge } from '@/components/ui/Feedback';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Overlay';
import { CameraCapture, ImageZoom } from '@/components/media/CameraCapture';
import { AiStudio } from './AiStudio';
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
  aiEnhanced?: boolean;
}

const MAX_PHOTOS = 12;
const MAX_PER_UPLOAD = 8;

type StagedPhoto = PreparedPhoto & { fingerprint: string };
const fingerprint = (f: File | Blob) => (f instanceof File ? `${f.name}:${f.size}:${f.lastModified}` : '');

/**
 * Product photos: take with the camera or upload from the device, preview and remove before
 * uploading, then reorder and choose the primary photo. Photos are the supplier's own and are
 * reviewed before the listing goes live.
 */
export function ProductPhotos({ productId, photos, canSubmit }: { productId: string; photos: ProductPhoto[]; canSubmit: boolean }) {
  const qc = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const captureInput = useRef<HTMLInputElement>(null);
  const [staged, setStaged] = useState<StagedPhoto[]>([]);
  const [problems, setProblems] = useState<string[]>([]);
  const [rights, setRights] = useState('');
  const [attribution, setAttribution] = useState('');
  const [camera, setCamera] = useState(false);
  const [order, setOrder] = useState<ProductPhoto[]>(photos);
  const [dragId, setDragId] = useState<string | null>(null);
  const [zoom, setZoom] = useState<ProductPhoto | null>(null);
  const [studio, setStudio] = useState<{ photoId?: string } | null>(null);
  const replaceInput = useRef<HTMLInputElement>(null);
  const replaceTarget = useRef<string | null>(null);
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
    const ok: StagedPhoto[] = [];
    // Skip files already staged (same name, size and date): choosing the same photo twice uploads it once.
    const seen = new Set(staged.map((p) => p.fingerprint));
    const fresh = files.filter((f) => {
      const fp = fingerprint(f);
      if (fp && seen.has(fp)) {
        errs.push(`"${(f as File).name}" is already in the list.`);
        return false;
      }
      if (fp) seen.add(fp);
      return true;
    });
    const accepted = fresh.slice(0, Math.max(0, room));
    if (fresh.length > accepted.length) errs.push(`A listing can have up to ${MAX_PHOTOS} photos — ${fresh.length - accepted.length} photo(s) were not added.`);
    for (const f of accepted) {
      try {
        ok.push({ ...(await preparePhoto(f, source)), fingerprint: fingerprint(f) || crypto.randomUUID() });
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

  const replace = useMutation({
    mutationFn: async ({ imageId, file }: { imageId: string; file: File }) => {
      const prepared = await preparePhoto(file, 'device');
      URL.revokeObjectURL(prepared.previewUrl);
      const fd = new FormData();
      fd.append('image', prepared.file, prepared.file.name);
      return api.post(`/supplier/products/${productId}/images/${imageId}/replace`, fd);
    },
    onSuccess: () => {
      toast({ tone: 'success', title: 'Photo replaced', description: 'The new photo keeps the same position and will be reviewed.' });
      void refresh();
    },
    onError: (e) => toast({ tone: 'error', title: 'Could not replace the photo', description: errorMessage(e) }),
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
                  <button type="button" onClick={() => setZoom(img)} className="absolute top-1.5 right-1.5 rounded-full bg-white/90 p-1.5 text-charcoal shadow hover:bg-white" aria-label={`Zoom photo ${i + 1}`}>
                    <Maximize2 className="size-3.5" />
                  </button>
                  {img.aiEnhanced && (
                    <span className="absolute right-1.5 bottom-1.5 inline-flex items-center gap-1 rounded-full bg-brand-900/90 px-2 py-0.5 text-[0.625rem] font-semibold text-gold-300">
                      <Sparkles className="size-3" aria-hidden /> AI enhanced
                    </span>
                  )}
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
                    onClick={() => {
                      replaceTarget.current = img.id;
                      replaceInput.current?.click();
                    }}
                    className="ml-auto rounded p-1.5 text-muted hover:bg-brand-50 hover:text-charcoal"
                    aria-label={`Replace photo ${i + 1}`}
                    title="Replace"
                  >
                    <Replace className="size-4" />
                  </button>
                  {!img.aiEnhanced && (
                    <button type="button" onClick={() => setStudio({ photoId: img.id })} className="rounded p-1.5 text-copper-600 hover:bg-copper-50" aria-label={`Enhance photo ${i + 1} with Dhaaga Bazaar AI`} title="Enhance with Dhaaga Bazaar AI">
                      <Sparkles className="size-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={async () => {
                      if (await confirm({ title: 'Remove this photo?', body: 'It is deleted from the listing. This cannot be undone.', confirmLabel: 'Remove photo', tone: 'danger' })) remove.mutate(img.id);
                    }}
                    className="rounded p-1.5 text-muted hover:bg-danger-bg hover:text-danger"
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
            Upload from Gallery / Device
          </Button>
          <Button type="button" variant="copper" icon={<Sparkles className="size-4" />} onClick={() => setStudio({})} disabled={room <= 0}>
            Enhance with Dhaaga Bazaar AI
          </Button>
        </div>
        <input
          ref={replaceInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          data-testid="photo-replace-input"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file && replaceTarget.current) replace.mutate({ imageId: replaceTarget.current, file });
          }}
        />
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

      {zoom && <ImageZoom open onClose={() => setZoom(null)} src={zoom.url} alt="Product photo" title={zoom.aiEnhanced ? 'AI-enhanced photo' : 'Product photo'} />}
      <Modal open={!!studio} onClose={() => setStudio(null)} title="Dhaaga Bazaar AI Studio" className="sm:max-w-6xl">
        <div className="bg-ivory-light p-3 sm:p-5">
          {studio && (
            <AiStudio
              productId={productId}
              productImageId={studio.photoId}
              onAccepted={() => {
                setStudio(null);
                void refresh();
              }}
            />
          )}
        </div>
      </Modal>
      <CameraCapture
        open={camera}
        title="Take product photo"
        onClose={() => setCamera(false)}
        onUseNativeCamera={() => captureInput.current?.click()}
        onCapture={(blob) => addFiles([new File([blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' })], 'camera')}
      />
    </Panel>
  );
}
