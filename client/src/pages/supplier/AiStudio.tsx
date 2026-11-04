import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Camera, Check, CheckCircle2, Circle, Columns2, Download, ImagePlus, Loader2, Maximize2, RefreshCw, ScanSearch, SplitSquareHorizontal, Sparkles, Trash2, TriangleAlert, Wand2 } from 'lucide-react';
import { AI_BACKGROUNDS, AI_LEVELS, AI_MODES, AI_STATUS_LABELS, type AiBackground, type AiLevel, type AiMode } from '@dhaaga/shared';
import { api, ApiError, errorMessage } from '@/lib/api';
import { AI_BASE, type AiGeneration, type AiSource, type AiStatus } from '@/lib/ai';
import { liveCameraSupported, preparePhoto } from '@/lib/photos';
import { CameraCapture, ImageZoom } from '@/components/media/CameraCapture';
import { PageHeader, Panel } from '@/components/dashboard/DashboardLayout';
import { Alert, StatusBadge } from '@/components/ui/Feedback';
import { Button } from '@/components/ui/Button';
import { Checkbox, Input, Select } from '@/components/ui/Field';
import { cn } from '@/lib/utils';
import { toast } from '@/stores/ui';

interface ProductOption {
  id: string;
  title: string;
  status: string;
  category: { name: string; path: string };
}

const sourceKey = (id: string | null) => ['supplier', 'ai', 'source', id];

/** Honest progress: named stages with real elapsed time — never a fake percentage. */
function Stages({ current, elapsed }: { current: number; elapsed: number }) {
  const stages = ['Preparing image', 'Analysing garment', 'Generating enhancement', 'Processing output', 'Ready for review'];
  return (
    <ol className="space-y-2 text-sm" aria-label="Enhancement progress">
      {stages.map((s, i) => (
        <li key={s} className={cn('flex items-center gap-2', i > current && 'text-muted')} aria-current={i === current ? 'step' : undefined}>
          {i < current ? <CheckCircle2 className="size-4 text-success" aria-hidden /> : i === current ? <Loader2 className="size-4 animate-spin text-copper-500" aria-hidden /> : <Circle className="size-4" aria-hidden />}
          {s}
          {i === current && i === 2 && <span className="text-xs text-muted tabular-nums">· {elapsed}s — usually 15–60 seconds</span>}
        </li>
      ))}
    </ol>
  );
}

/** Before/after comparison: side by side, or a slider that reveals the enhanced version over the original. */
function Compare({ original, enhanced, onZoom }: { original: string; enhanced: string; onZoom: (which: 'original' | 'enhanced') => void }) {
  const [view, setView] = useState<'side' | 'slider'>('side');
  const [pos, setPos] = useState(50);
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2" role="group" aria-label="Comparison view">
        <Button size="sm" variant={view === 'side' ? 'primary' : 'subtle'} icon={<Columns2 className="size-4" />} onClick={() => setView('side')} aria-pressed={view === 'side'}>
          Side by side
        </Button>
        <Button size="sm" variant={view === 'slider' ? 'primary' : 'subtle'} icon={<SplitSquareHorizontal className="size-4" />} onClick={() => setView('slider')} aria-pressed={view === 'slider'}>
          Before / after slider
        </Button>
      </div>
      {view === 'side' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ['original', original, 'Original photograph'],
              ['enhanced', enhanced, 'Dhaaga Bazaar AI enhanced'],
            ] as const
          ).map(([k, src, label]) => (
            <figure key={k}>
              <button type="button" onClick={() => onZoom(k)} className="group relative block w-full overflow-hidden rounded-lg border border-line bg-brand-50" aria-label={`Zoom ${label}`}>
                <img src={src} alt={label} className="aspect-[4/5] w-full object-contain" />
                <Maximize2 className="absolute top-2 right-2 size-7 rounded-full bg-white/90 p-1.5 text-charcoal opacity-80 shadow group-hover:opacity-100" aria-hidden />
              </button>
              <figcaption className="mt-1.5 text-xs font-medium text-muted">{label}</figcaption>
            </figure>
          ))}
        </div>
      ) : (
        <div>
          <div className="relative mx-auto aspect-[4/5] max-w-md overflow-hidden rounded-lg border border-line bg-brand-50 select-none">
            <img src={original} alt="Original photograph" className="absolute inset-0 size-full object-contain" />
            <img src={enhanced} alt="Dhaaga Bazaar AI enhanced" className="absolute inset-0 size-full object-contain" style={{ clipPath: `inset(0 0 0 ${pos}%)` }} />
            <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.25)]" style={{ left: `${pos}%` }} aria-hidden />
            <span className="absolute top-2 left-2 rounded bg-charcoal/75 px-1.5 py-0.5 text-[0.6875rem] text-white">Original</span>
            <span className="absolute top-2 right-2 rounded bg-copper-600/90 px-1.5 py-0.5 text-[0.6875rem] text-white">AI enhanced</span>
          </div>
          <label className="mx-auto mt-3 block max-w-md text-xs text-muted">
            Drag to compare
            <input type="range" min={0} max={100} value={pos} onChange={(e) => setPos(Number(e.target.value))} className="mt-1 w-full accent-copper-500" aria-label="Before and after position" />
          </label>
        </div>
      )}
    </div>
  );
}

function AnalysisSummary({ source }: { source: AiSource }) {
  const a = source.analysis!;
  const rows: [string, string][] = [
    ['Garment', a.garmentType],
    ['Main colour', [a.dominantColour, ...a.otherColours].join(', ')],
    ['Fabric look', a.fabricAppearance],
    ['Pattern / print', [a.pattern, a.printOrEmbroidery].filter((x) => x && !/^(none|not visible|unclear)$/i.test(x)).join(' · ') || 'None visible'],
    ['Neckline · sleeves', `${a.neckline} · ${a.sleeves}`],
    ['Buttons / zips', a.closures],
    ['Wrinkles', a.wrinkles],
    ['Photo quality', `${a.imageQuality} (confidence: ${a.confidence})`],
  ];
  return (
    <div className="rounded-lg border border-line bg-white p-3 text-sm">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      {(a.lightingIssues.length > 0 || a.backgroundDistractions.length > 0) && (
        <p className="mt-2 text-xs text-muted">Will improve: {[...a.lightingIssues, ...a.backgroundDistractions].join('; ')}</p>
      )}
      {a.notes && <p className="mt-2 text-xs text-muted">{a.notes}</p>}
      {a.confidence === 'low' && <p className="mt-2 text-xs text-warning">The AI is not sure about this photo — please check the garment type and colour below.</p>}
    </div>
  );
}

export interface AiStudioProps {
  /** Listing the accepted image will be attached to (from Add/Edit Product). */
  productId?: string;
  /** Start from an existing listing photo. */
  productImageId?: string;
  /** Re-open a photo already in the studio (from history). */
  initialSourceId?: string;
  /** Called after a version is accepted into a listing. */
  onAccepted?: (productId: string) => void;
}

/**
 * Dhaaga Bazaar AI Studio: capture or upload a garment photo, analyse it, generate an enhanced
 * version with Google Gemini, compare, regenerate, and accept a version into a listing. Every
 * Gemini call is an explicit button press; originals are never overwritten.
 */
export function AiStudio({ productId: fixedProductId, productImageId, initialSourceId, onAccepted }: AiStudioProps) {
  const qc = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const captureInput = useRef<HTMLInputElement>(null);
  const [sourceId, setSourceId] = useState<string | null>(initialSourceId ?? null);
  const [camera, setCamera] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [garmentType, setGarmentType] = useState('');
  const [colour, setColour] = useState('');
  const [background, setBackground] = useState<AiBackground>('PURE_WHITE');
  const [mode, setMode] = useState<AiMode>('FULL');
  const [level, setLevel] = useState<AiLevel>('BALANCED');
  const [ack, setAck] = useState(false);
  const [activeGen, setActiveGen] = useState<string | null>(null);
  const [selectedGen, setSelectedGen] = useState<string | null>(null);
  const [zoom, setZoom] = useState<{ src: string; title: string } | null>(null);
  const [targetProduct, setTargetProduct] = useState(fixedProductId ?? '');
  const [includeOriginal, setIncludeOriginal] = useState(true);
  const [makePrimary, setMakePrimary] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const status = useQuery({ queryKey: ['supplier', 'ai', 'status'], queryFn: () => api.get<AiStatus>(`${AI_BASE}/status`) });
  const products = useQuery({ queryKey: ['supplier', 'products'], queryFn: () => api.get<{ products: ProductOption[] }>('/supplier/products'), enabled: !fixedProductId });
  const sourceQ = useQuery({ queryKey: sourceKey(sourceId), queryFn: () => api.get<{ source: AiSource; generations: AiGeneration[] }>(`${AI_BASE}/sources/${sourceId}`), enabled: !!sourceId });
  const source = sourceQ.data?.source ?? null;
  const versions = sourceQ.data?.generations ?? [];

  // Poll only while a generation is running (no API calls to Gemini — this reads our own status).
  const genQ = useQuery({
    queryKey: ['supplier', 'ai', 'generation', activeGen],
    queryFn: () => api.get<{ generation: AiGeneration }>(`${AI_BASE}/generations/${activeGen}`),
    enabled: !!activeGen,
    refetchInterval: (q) => (q.state.data?.generation.status === 'GENERATING' || !q.state.data ? 2000 : false),
  });
  const running = genQ.data?.generation.status === 'GENERATING' || (!!activeGen && !genQ.data);

  useEffect(() => {
    if (!running) return setElapsed(0);
    const started = Date.now();
    const t = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(t);
  }, [running]);

  useEffect(() => {
    const g = genQ.data?.generation;
    if (!g || g.status === 'GENERATING') return;
    setActiveGen(null);
    void qc.invalidateQueries({ queryKey: sourceKey(sourceId) });
    void qc.invalidateQueries({ queryKey: ['supplier', 'ai', 'status'] });
    void qc.invalidateQueries({ queryKey: ['supplier', 'ai', 'history'] });
    if (g.status === 'COMPLETED') {
      setSelectedGen(g.id);
      toast({ tone: 'success', title: 'Enhanced photo ready', description: 'Compare it with your original, then accept or regenerate.' });
    } else if (g.status === 'FAILED') toast({ tone: 'error', title: 'Enhancement failed', description: g.error ?? undefined });
  }, [genQ.data, qc, sourceId]);

  // Prefill the editable garment details from the analysis (the supplier can correct them).
  useEffect(() => {
    if (source?.analysis) {
      setGarmentType((v) => v || source.analysis!.garmentType);
      setColour((v) => v || source.analysis!.dominantColour);
    }
  }, [source?.analysis]);

  const resetForSource = (id: string) => {
    setSourceId(id);
    setGarmentType('');
    setColour('');
    setAck(false);
    setSelectedGen(null);
    setProblem(null);
  };

  const uploadSource = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append('image', file, file.name);
      if (fixedProductId) fd.append('productId', fixedProductId);
      return api.post<{ source: AiSource; duplicate: boolean }>(`${AI_BASE}/sources`, fd);
    },
    onSuccess: (r) => {
      resetForSource(r.source.id);
      qc.setQueryData(sourceKey(r.source.id), undefined);
      if (r.duplicate) toast({ tone: 'info', title: 'You have used this photo before', description: 'Its earlier analysis and versions are shown — nothing was uploaded twice.' });
    },
    onError: (e) => setProblem(errorMessage(e)),
  });

  const fromProductImage = useMutation({
    mutationFn: (id: string) => api.post<{ source: AiSource }>(`${AI_BASE}/sources/from-product-image`, { productImageId: id }),
    onSuccess: (r) => resetForSource(r.source.id),
    onError: (e) => setProblem(errorMessage(e)),
  });
  const startedFrom = useRef<string | null>(null);
  useEffect(() => {
    if (productImageId && startedFrom.current !== productImageId) {
      startedFrom.current = productImageId;
      fromProductImage.mutate(productImageId);
    }
  }, [productImageId, fromProductImage]);

  const addFile = async (f: File | Blob, origin: 'camera' | 'device') => {
    setProblem(null);
    setPreparing(true);
    try {
      const prepared = await preparePhoto(f, origin);
      URL.revokeObjectURL(prepared.previewUrl);
      await uploadSource.mutateAsync(prepared.file);
      return null;
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : (e as Error).message;
      setProblem(msg);
      return msg;
    } finally {
      setPreparing(false);
    }
  };

  const analyse = useMutation({
    mutationFn: () => api.post<{ source: AiSource }>(`${AI_BASE}/sources/${sourceId}/analyse`),
    onSuccess: (r) => {
      qc.setQueryData(sourceKey(sourceId), (old: { source: AiSource; generations: AiGeneration[] } | undefined) => ({ source: r.source, generations: old?.generations ?? [] }));
      void qc.invalidateQueries({ queryKey: ['supplier', 'ai', 'status'] });
    },
    onError: (e) => {
      toast({ tone: 'error', title: 'Analysis failed', description: errorMessage(e) });
      void qc.invalidateQueries({ queryKey: sourceKey(sourceId) });
    },
  });

  const product = useMemo(() => products.data?.products.find((p) => p.id === targetProduct), [products.data, targetProduct]);
  const generate = useMutation({
    mutationFn: () =>
      api.post<{ generation: AiGeneration }>(`${AI_BASE}/generations`, {
        sourceId,
        background,
        mode,
        level,
        garmentType,
        colour,
        categoryPath: product?.category.path,
        defectsAcknowledged: ack,
      }),
    onSuccess: (r) => {
      setActiveGen(r.generation.id);
      setSelectedGen(null);
      void qc.invalidateQueries({ queryKey: ['supplier', 'ai', 'status'] });
    },
    onError: (e) => toast({ tone: 'error', title: 'Could not start the enhancement', description: errorMessage(e) }),
  });

  const accept = useMutation({
    mutationFn: (g: AiGeneration) => api.post(`${AI_BASE}/generations/${g.id}/accept`, { productId: targetProduct, includeOriginal: includeOriginal && !source?.productImageId, makePrimary }),
    onSuccess: () => {
      toast({ tone: 'success', title: 'Added to your listing', description: 'The enhanced photo is attached to the draft and will be reviewed with the listing. Your original is kept.' });
      void qc.invalidateQueries({ queryKey: sourceKey(sourceId) });
      void qc.invalidateQueries({ queryKey: ['supplier', 'product', targetProduct] });
      void qc.invalidateQueries({ queryKey: ['supplier', 'products'] });
      void qc.invalidateQueries({ queryKey: ['supplier', 'ai', 'history'] });
      onAccepted?.(targetProduct);
    },
    onError: (e) => toast({ tone: 'error', title: 'Could not add the photo', description: errorMessage(e) }),
  });

  const discard = useMutation({
    mutationFn: (g: AiGeneration) => api.post(`${AI_BASE}/generations/${g.id}/discard`),
    onSuccess: () => {
      setSelectedGen(null);
      toast({ tone: 'success', title: 'Version discarded', description: 'Your original photo is unchanged.' });
      void qc.invalidateQueries({ queryKey: sourceKey(sourceId) });
      void qc.invalidateQueries({ queryKey: ['supplier', 'ai', 'history'] });
    },
    onError: (e) => toast({ tone: 'error', title: errorMessage(e) }),
  });

  const ready = versions.filter((v) => v.status === 'COMPLETED' || v.status === 'ACCEPTED');
  const selected = versions.find((v) => v.id === selectedGen) ?? ready[0] ?? null;
  const a = source?.analysis;
  const needsAck = !!a && (a.possibleDefects.length > 0 || !a.safeToEnhance);
  const configured = status.data?.configured;
  const usage = status.data?.usage;
  const limitReached = !!usage && usage.generations >= usage.generationLimit;
  const canGenerate = !!source && source.analysisStatus === 'COMPLETED' && garmentType.trim().length >= 2 && colour.trim().length >= 2 && (!needsAck || ack) && !running && !generate.isPending && configured && !limitReached;
  const stage = preparing || uploadSource.isPending ? 0 : analyse.isPending ? 1 : running ? 2 : -1;
  const busy = preparing || uploadSource.isPending || fromProductImage.isPending;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      {/* LEFT: capture, original, settings */}
      <div className="space-y-5">
        {status.data && !configured && (
          <Alert tone="warning" title="AI is not configured">
            The server has no Gemini API key, so enhancements cannot run. Your photos can still be uploaded to listings normally.
          </Alert>
        )}
        <Panel title="1 · Your photograph">
          <div className="flex flex-wrap gap-2">
            <Button icon={<Camera className="size-4" />} onClick={() => (liveCameraSupported() ? setCamera(true) : captureInput.current?.click())} disabled={busy || running}>
              Take Photo
            </Button>
            <Button variant="outline" icon={<ImagePlus className="size-4" />} onClick={() => fileInput.current?.click()} disabled={busy || running}>
              Upload from Gallery / Device
            </Button>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            data-testid="ai-file-input"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void addFile(f, 'device');
            }}
          />
          <input
            ref={captureInput}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            data-testid="ai-capture-input"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void addFile(f, 'camera');
            }}
          />
          {problem && (
            <Alert tone="danger" className="mt-3">
              {problem}
            </Alert>
          )}
          {busy && (
            <p className="mt-3 flex items-center gap-2 text-sm text-muted">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Preparing and uploading your photo…
            </p>
          )}
          {source ? (
            <figure className="mt-4">
              <button type="button" onClick={() => setZoom({ src: source.url, title: 'Original photograph' })} className="block w-full overflow-hidden rounded-lg border border-line bg-brand-50" aria-label="Zoom original photograph">
                <img src={source.url} alt="Original photograph" className="aspect-[4/5] w-full object-contain" />
              </button>
              <figcaption className="mt-1.5 text-xs text-muted">
                Original · {source.width}×{source.height}px · kept unchanged
              </figcaption>
            </figure>
          ) : (
            !busy && <p className="mt-3 text-sm text-muted">Photograph the garment flat or on a hanger in daylight. The original is stored privately and never overwritten.</p>
          )}
        </Panel>

        {source && (
          <Panel title="2 · Garment analysis">
            {source.analysisStatus === 'COMPLETED' && a ? (
              <div className="space-y-3">
                <AnalysisSummary source={source} />
                {a.possibleDefects.length > 0 && (
                  <Alert tone="warning" title="Possible defects spotted">
                    {a.possibleDefects.join('; ')}. Dhaaga Bazaar AI will not hide defects — they stay visible so retailers see the real product. Check the item before listing it.
                  </Alert>
                )}
                {!a.safeToEnhance && (
                  <Alert tone="warning" title="Consider retaking this photo">
                    This photo may be too unclear to enhance without changing how the garment looks. A retake in good light, showing the whole garment, will give a more faithful result.
                  </Alert>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input label="Garment type" value={garmentType} onChange={(e) => setGarmentType(e.target.value)} hint="Correct it if the AI got it wrong" />
                  <Input label="Main colour" value={colour} onChange={(e) => setColour(e.target.value)} />
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted">The AI first checks the garment type, colour, details, wrinkles and any visible defects, so the enhancement can be matched to your product.</p>
                {source.analysisStatus === 'FAILED' && <Alert tone="danger">The last analysis failed. You can try again.</Alert>}
                {analyse.isPending ? <Stages current={1} elapsed={0} /> : null}
                <Button icon={<ScanSearch className="size-4" />} onClick={() => analyse.mutate()} loading={analyse.isPending} disabled={!configured || source.analysisStatus === 'ANALYSING'}>
                  Analyse photo
                </Button>
              </div>
            )}
          </Panel>
        )}

        {source?.analysisStatus === 'COMPLETED' && (
          <Panel title="3 · Background & enhancement">
            <fieldset>
              <legend className="mb-2 text-sm font-semibold">Background</legend>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                {AI_BACKGROUNDS.map((b) => (
                  <label key={b.value} className={cn('flex cursor-pointer gap-3 rounded-lg border p-2.5 text-sm transition-colors', background === b.value ? 'border-copper-500 bg-copper-50 ring-1 ring-copper-500' : 'border-line bg-white hover:border-line-strong')}>
                    <input type="radio" name="ai-background" value={b.value} checked={background === b.value} onChange={() => setBackground(b.value)} className="sr-only" />
                    <span className="mt-0.5 size-9 shrink-0 rounded-md border border-line shadow-inner" style={{ background: b.swatch }} aria-hidden />
                    <span>
                      <span className="block font-medium">{b.label}</span>
                      <span className="block text-xs text-muted">{b.description}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="mt-4 grid gap-3">
              <Select label="Enhancement" value={mode} onChange={(e) => setMode(e.target.value as AiMode)} hint={AI_MODES.find((m) => m.value === mode)?.description}>
                {AI_MODES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </Select>
              <fieldset>
                <legend className="mb-2 text-sm font-semibold">Enhancement level</legend>
                <div className="grid grid-cols-3 gap-2">
                  {AI_LEVELS.map((l) => (
                    <label key={l.value} className={cn('cursor-pointer rounded-lg border p-2 text-center text-xs', level === l.value ? 'border-copper-500 bg-copper-50 font-semibold ring-1 ring-copper-500' : 'border-line bg-white')} title={l.description}>
                      <input type="radio" name="ai-level" value={l.value} checked={level === l.value} onChange={() => setLevel(l.value)} className="sr-only" />
                      {l.label}
                    </label>
                  ))}
                </div>
              </fieldset>
              {!fixedProductId && (
                <Select label="Listing (used to match the category)" value={targetProduct} onChange={(e) => setTargetProduct(e.target.value)} hint="Optional now — required when you accept a version.">
                  <option value="">Choose a listing…</option>
                  {products.data?.products
                    .filter((p) => p.status !== 'ARCHIVED')
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title} · {p.category.name}
                      </option>
                    ))}
                </Select>
              )}
              {needsAck && <Checkbox label="I have reviewed the warnings above" description="Defects stay visible in the enhanced photo." checked={ack} onChange={(e) => setAck(e.target.checked)} />}
            </div>
            <Button className="mt-4 w-full" size="lg" variant="copper" icon={<Wand2 className="size-4" />} onClick={() => generate.mutate()} loading={generate.isPending} disabled={!canGenerate}>
              {ready.length ? 'Regenerate' : 'Generate enhanced photo'}
            </Button>
            {usage && (
              <p className={cn('mt-2 text-xs', limitReached ? 'text-danger' : 'text-muted')}>
                {usage.generations} of {usage.generationLimit} enhancements used in the last 24 hours. Each Generate is one request to Google Gemini.
              </p>
            )}
          </Panel>
        )}
      </div>

      {/* RIGHT: result, compare, decisions */}
      <div className="space-y-5">
        <Panel title="Result">
          {stage >= 0 ? (
            <div className="py-6">
              <Stages current={stage} elapsed={elapsed} />
              {running && <p className="mt-4 text-xs text-muted">You can keep this page open; nothing is charged twice if you refresh.</p>}
            </div>
          ) : source && selected?.url ? (
            <div className="space-y-4">
              <Compare original={source.url} enhanced={selected.url} onZoom={(w) => setZoom(w === 'original' ? { src: source.url, title: 'Original photograph' } : { src: selected.url!, title: 'Dhaaga Bazaar AI enhanced' })} />
              <Alert tone="info">AI editing is not perfectly predictable. Check that the colour, print, neckline, sleeves and every detail match your real product before accepting.</Alert>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={selected.status} label={AI_STATUS_LABELS[selected.status]} />
                <span className="text-xs text-muted">
                  {AI_BACKGROUNDS.find((b) => b.value === selected.background)?.label} · {AI_LEVELS.find((l) => l.value === selected.level)?.label} · {selected.model}
                </span>
              </div>
              {selected.status === 'COMPLETED' && (
                <div className="space-y-3 rounded-lg border border-line bg-ivory-light p-3">
                  {!fixedProductId && !targetProduct && <p className="text-sm text-muted">Choose the listing in step 3 to accept this version.</p>}
                  {!source.productImageId && <Checkbox label="Also add my original photo to the listing" checked={includeOriginal} onChange={(e) => setIncludeOriginal(e.target.checked)} />}
                  <Checkbox label="Make the enhanced photo the primary photo" checked={makePrimary} onChange={(e) => setMakePrimary(e.target.checked)} />
                  <div className="flex flex-wrap gap-2">
                    <Button icon={<Check className="size-4" />} onClick={() => accept.mutate(selected)} loading={accept.isPending} disabled={!targetProduct}>
                      Accept Image
                    </Button>
                    <Button variant="subtle" icon={<RefreshCw className="size-4" />} onClick={() => generate.mutate()} disabled={!canGenerate}>
                      Regenerate
                    </Button>
                    <Button variant="subtle" icon={<Trash2 className="size-4" />} onClick={() => discard.mutate(selected)} loading={discard.isPending}>
                      Discard Image
                    </Button>
                    <a href={`/api${AI_BASE}/files/generation/${selected.id}?download=1`} className="inline-flex h-11 items-center gap-2 rounded-md px-3 text-sm font-medium text-copper-600 hover:underline">
                      <Download className="size-4" aria-hidden /> Download preview
                    </a>
                  </div>
                </div>
              )}
              {selected.status === 'ACCEPTED' && <Alert tone="success">This version is on your listing (pending review with the listing).</Alert>}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <Sparkles className="size-10 text-gold-500" aria-hidden />
              <p className="max-w-sm text-sm text-muted">{source ? 'Analyse the photo, choose a background, then generate. The enhanced version appears here next to your original.' : 'Take or upload a garment photo to begin.'}</p>
              {versions.some((v) => v.status === 'FAILED') && <Alert tone="danger">{versions.find((v) => v.status === 'FAILED')?.error}</Alert>}
            </div>
          )}
        </Panel>

        {versions.length > 0 && (
          <Panel title={`Versions of this photo (${versions.length})`}>
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-6" aria-label="Versions">
              {versions.map((v) => (
                <li key={v.id}>
                  <button type="button" onClick={() => v.url && setSelectedGen(v.id)} disabled={!v.url} className={cn('block w-full overflow-hidden rounded-lg border bg-white text-left', selected?.id === v.id ? 'border-copper-500 ring-2 ring-copper-500/30' : 'border-line')} aria-label={`Version from ${new Date(v.createdAt).toLocaleTimeString()} — ${AI_STATUS_LABELS[v.status]}`}>
                    {v.url ? <img src={v.url} alt="" className="aspect-square w-full object-cover" /> : <span className="flex aspect-square items-center justify-center bg-brand-50 text-muted">{v.status === 'GENERATING' ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <TriangleAlert className="size-5" aria-hidden />}</span>}
                    <span className="block truncate px-1.5 py-1 text-[0.625rem] text-muted">{AI_STATUS_LABELS[v.status]}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </div>

      <CameraCapture
        open={camera}
        onClose={() => setCamera(false)}
        title="Take garment photo"
        allowMultiple={false}
        onUseNativeCamera={() => captureInput.current?.click()}
        onCapture={(blob) => addFile(new File([blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' }), 'camera')}
      />
      {zoom && <ImageZoom open onClose={() => setZoom(null)} src={zoom.src} alt={zoom.title} title={zoom.title} />}
    </div>
  );
}

/** History of previous enhancements across all photos. */
function AiHistory({ onOpen }: { onOpen: (sourceId: string) => void }) {
  const q = useQuery({ queryKey: ['supplier', 'ai', 'history'], queryFn: () => api.get<{ generations: AiGeneration[] }>(`${AI_BASE}/generations`) });
  const list = q.data?.generations ?? [];
  if (!list.length) return null;
  return (
    <Panel title="Enhancement history">
      <ul className="divide-y divide-line">
        {list.slice(0, 20).map((g) => (
          <li key={g.id} className="flex flex-wrap items-center gap-3 py-2.5">
            <img src={g.sourceUrl} alt="" className="size-12 rounded border border-line object-cover" />
            {g.url ? <img src={g.url} alt="" className="size-12 rounded border border-line object-cover" /> : <span className="size-12 rounded border border-dashed border-line" />}
            <div className="min-w-[10rem] flex-1 text-sm">
              <p className="font-medium">{g.garmentType}</p>
              <p className="text-xs text-muted">
                {new Date(g.createdAt).toLocaleString()} · {AI_BACKGROUNDS.find((b) => b.value === g.background)?.label}
              </p>
            </div>
            <StatusBadge status={g.status} label={AI_STATUS_LABELS[g.status]} />
            <Button size="sm" variant="subtle" onClick={() => onOpen(g.sourceId)}>
              Open
            </Button>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** /supplier/ai-studio */
export function AiStudioPage() {
  const [params] = useSearchParams();
  const [openSource, setOpenSource] = useState<string | null>(null);
  return (
    <div>
      <PageHeader
        title="Dhaaga Bazaar AI Studio"
        description="Turn everyday garment photos into clean catalogue photographs with Google Gemini — same garment, better photography. You review every result; nothing is published automatically."
        actions={
          <Link to="/supplier" className="inline-flex items-center gap-1.5 text-sm font-medium text-copper-600 hover:underline">
            <ArrowLeft className="size-4" aria-hidden /> Back to Supplier Dashboard
          </Link>
        }
      />
      <div className="mb-5 rounded-xl border border-gold-500/40 bg-gradient-to-r from-brand-900 via-brand-800 to-copper-600 p-4 text-white sm:p-5">
        <p className="flex items-center gap-2 font-serif text-lg font-semibold text-white">
          <Sparkles className="size-5 text-gold-300" aria-hidden /> How it works
        </p>
        <p className="mt-1 text-sm text-white/85">Take or upload a photo → Analyse → choose a background → Generate → compare → Accept into your listing draft. Wrinkles, lighting and background are improved; colour, print and design are kept. Defects are never hidden.</p>
      </div>
      {openSource && (
        <Button size="sm" variant="ghost" className="mb-3" onClick={() => setOpenSource(null)}>
          ← Start with a new photo
        </Button>
      )}
      <AiStudio key={openSource ?? 'new'} initialSourceId={openSource ?? undefined} productId={params.get('product') ?? undefined} productImageId={openSource ? undefined : (params.get('photo') ?? undefined)} />
      <div className="mt-5">
        <AiHistory
          onOpen={(id) => {
            setOpenSource(id);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        />
      </div>
    </div>
  );
}
