import { useRef, useState } from 'react';
import { Link, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Boxes, Camera, Settings, Bell, Building2, ClipboardList, FileUp, LayoutDashboard, MessagesSquare, Package, Plus, ShieldCheck, Sparkles, Trash2, Truck, X } from 'lucide-react';
import { PAYMENT_STATUS_LABELS, SUPPLIER_DOCUMENT_TYPES, SUPPLIER_STATUS_LABELS, dispatchSchema, formatINR, formatNumber, PRICE_UNIT_SHORT } from '@dhaaga/shared';
import { api, errorMessage } from '@/lib/api';
import { DashboardLayout, NotificationsView, PageHeader, Panel, StatCard, useUnreadCount, type NavItem } from '@/components/dashboard/DashboardLayout';
import { Alert, EmptyState, ErrorState, PageLoader, SmartImage, StatusBadge } from '@/components/ui/Feedback';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Field';
import { formatDate, titleCase } from '@/lib/utils';
import { toast } from '@/stores/ui';
import { SupplierProfileForm, type SupplierRecord } from './SupplierProfileForm';
import { ProductEditor } from './ProductEditor';
import { AiStudioPage } from './AiStudio';
import { CameraCapture } from '@/components/media/CameraCapture';
import { liveCameraSupported } from '@/lib/photos';
import { AccountSettings } from '@/components/dashboard/AccountSettings';
import { cn } from '@/lib/utils';
import { PLACEHOLDER_IMAGE } from '@/lib/images';

function useSupplier() {
  return useQuery({ queryKey: ['supplier', 'me'], queryFn: () => api.get<{ supplier: SupplierRecord }>('/supplier/me') });
}

/** Resubmits the application after the supplier has addressed an information request or rejection. */
function ResubmitButton({ label = 'Resubmit application' }: { label?: string }) {
  const qc = useQueryClient();
  const submit = useMutation({
    mutationFn: () => api.post('/supplier/submit'),
    onSuccess: () => {
      toast({ tone: 'success', title: 'Application submitted', description: 'Our team will review it and notify you of the decision.' });
      void qc.invalidateQueries({ queryKey: ['supplier'] });
      void qc.invalidateQueries({ queryKey: ['auth'] });
    },
    onError: (e) => toast({ tone: 'error', title: 'Not submitted yet', description: errorMessage(e) }),
  });
  return (
    <Button size="sm" className="mt-3" onClick={() => submit.mutate()} loading={submit.isPending} icon={<ShieldCheck className="size-4" />}>
      {label}
    </Button>
  );
}

/** Application status straight from the database — the wording follows the status the admin set. */
function StatusBanner({ s, showActions = true }: { s: SupplierRecord; showActions?: boolean }) {
  const label = (
    <span className="mb-1 block">
      <StatusBadge status={s.status} label={SUPPLIER_STATUS_LABELS[s.status]} />
    </span>
  );
  if (s.status === 'APPROVED')
    return (
      <Alert tone="success" title="Your supplier account has been approved. You can now continue with product publishing." className="mb-6">
        {label}
        {s.isVerified ? 'Your business documents are verified.' : 'Document verification is separate — a “documents verified” mark appears only after our team accepts your documents.'}
        {showActions && (
          <div>
            <ButtonLink to="/supplier/products/new" size="sm" className="mt-3">
              Add a product
            </ButtonLink>
          </div>
        )}
      </Alert>
    );
  if (s.status === 'PENDING_REVIEW')
    return (
      <Alert tone="warning" title="Your application is currently under review." className="mb-6">
        {label}
        {s.submittedAt ? `Submitted on ${formatDate(s.submittedAt)}. ` : ''}Our team is reviewing your business details and documents. You can prepare product drafts in the meantime; they are published only after your account is approved.
      </Alert>
    );
  if (s.status === 'INFO_REQUESTED')
    return (
      <Alert tone="info" title="Additional information required" className="mb-6">
        {label}
        <p>Our review team needs the following before they can decide on your application:</p>
        <blockquote className="mt-2 rounded-md border-l-4 border-copper-500 bg-white/70 px-3 py-2 font-medium whitespace-pre-line text-charcoal">{s.infoRequest}</blockquote>
        <p className="mt-2">
          Update your <Link to="/supplier/onboarding" className="font-semibold underline">business details or documents</Link>, then resubmit.
        </p>
        {showActions && <ResubmitButton />}
      </Alert>
    );
  if (s.status === 'REJECTED')
    return (
      <Alert tone="danger" title="Your application requires attention." className="mb-6">
        {label}
        <p>Reason given by our review team:</p>
        <blockquote className="mt-2 rounded-md border-l-4 border-danger bg-white/70 px-3 py-2 font-medium whitespace-pre-line text-charcoal">{s.rejectionReason}</blockquote>
        <p className="mt-2">
          You can correct your <Link to="/supplier/onboarding" className="font-semibold underline">business details or documents</Link> and resubmit.
        </p>
        {showActions && <ResubmitButton />}
      </Alert>
    );
  if (s.status === 'SUSPENDED')
    return (
      <Alert tone="danger" title="Your supplier account is suspended." className="mb-6">
        {label}
        {s.rejectionReason} Your listings are hidden from retailers. Please <Link to="/contact" className="underline">contact support</Link>.
      </Alert>
    );
  return (
    <Alert tone="info" title="Your application is a draft" className="mb-6">
      {label}
      Add your business details and verification documents, then submit for review. <Link to="/supplier/onboarding" className="font-semibold underline">Continue onboarding →</Link>
    </Alert>
  );
}

// ─── Onboarding ──────────────────────────────────────────────────────────
function Documents({ s }: { s: SupplierRecord }) {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const captureInput = useRef<HTMLInputElement>(null);
  const [type, setType] = useState('GST_CERTIFICATE');
  const [camera, setCamera] = useState(false);
  // The chosen/captured document waits here for a preview before it is submitted.
  const [pending, setPending] = useState<{ file: File; preview: string | null; source: 'camera' | 'device' } | null>(null);
  const choose = (file: File, source: 'camera' | 'device') => {
    if (pending?.preview) URL.revokeObjectURL(pending.preview);
    setPending({ file, source, preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null });
  };
  const clearPending = () => {
    if (pending?.preview) URL.revokeObjectURL(pending.preview);
    setPending(null);
  };
  const upload = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('type', type);
      return api.post('/supplier/documents', fd);
    },
    onSuccess: () => {
      toast({ tone: 'success', title: 'Document uploaded' });
      clearPending();
      void qc.invalidateQueries({ queryKey: ['supplier', 'me'] });
    },
    onError: (e) => toast({ tone: 'error', title: 'Upload failed', description: errorMessage(e) }),
  });
  const remove = useMutation({ mutationFn: (id: string) => api.delete(`/supplier/documents/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['supplier', 'me'] }), onError: (e) => toast({ tone: 'error', title: errorMessage(e) }) });
  return (
    <Panel title="Verification documents">
      <p className="mb-4 text-sm text-muted">Upload clear PDF, JPG or PNG copies (max 8 MB). Documents are stored privately and seen only by our review team.</p>
      {s.documents.length > 0 && (
        <ul className="mb-4 divide-y divide-line rounded-lg border border-line">
          {s.documents.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
              <span className="font-medium">{SUPPLIER_DOCUMENT_TYPES.find((t) => t.value === d.type)?.label ?? d.type}</span>
              <span className="truncate text-muted">{d.fileName}</span>
              <StatusBadge status={d.status} />
              {d.reviewNote && <span className="w-full text-xs text-danger">{d.reviewNote}</span>}
              {d.status !== 'ACCEPTED' && (
                <button onClick={() => remove.mutate(d.id)} className="ml-auto rounded p-1 text-muted hover:text-danger" aria-label={`Remove ${d.fileName}`}>
                  <Trash2 className="size-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Select label="Document type" value={type} onChange={(e) => setType(e.target.value)} wrapClassName="sm:w-72">
          {SUPPLIER_DOCUMENT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </Select>
        <input
          ref={input}
          type="file"
          accept="application/pdf,image/jpeg,image/png"
          className="hidden"
          data-testid="document-file-input"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) choose(f, 'device');
          }}
        />
        <input
          ref={captureInput}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          data-testid="document-capture-input"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) choose(f, 'camera');
          }}
        />
        <Button variant="subtle" icon={<Camera className="size-4" />} onClick={() => (liveCameraSupported() ? setCamera(true) : captureInput.current?.click())} disabled={upload.isPending}>
          Take Photo of Document
        </Button>
        <Button variant="subtle" icon={<FileUp className="size-4" />} onClick={() => input.current?.click()} disabled={upload.isPending}>
          Upload Document from Device
        </Button>
      </div>
      {pending && (
        <div className="mt-4 rounded-lg border border-line bg-ivory-light p-3" aria-label="Document ready to submit">
          <div className="flex flex-col gap-3 sm:flex-row">
            {pending.preview ? (
              <img src={pending.preview} alt="Document preview" className="max-h-72 w-full rounded border border-line bg-white object-contain sm:w-64" />
            ) : (
              <div className="flex h-24 w-full items-center justify-center rounded border border-line bg-white text-sm text-muted sm:w-64">PDF · {pending.file.name}</div>
            )}
            <div className="flex-1 text-sm">
              <p className="font-medium">{SUPPLIER_DOCUMENT_TYPES.find((t) => t.value === type)?.label}</p>
              <p className="text-muted">
                {pending.file.name} · {(pending.file.size / 1024 / 1024).toFixed(1)} MB
              </p>
              <p className="mt-1 text-xs text-muted">Check that every word, number, seal and signature is readable. Documents are stored privately and are never edited or sent to AI.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" icon={<FileUp className="size-4" />} loading={upload.isPending} onClick={() => upload.mutate(pending.file)}>
                  Submit document
                </Button>
                <Button size="sm" variant="subtle" onClick={() => (pending.source === 'camera' && liveCameraSupported() ? setCamera(true) : pending.source === 'camera' ? captureInput.current?.click() : input.current?.click())} disabled={upload.isPending}>
                  {pending.source === 'camera' ? 'Retake' : 'Replace'}
                </Button>
                <Button size="sm" variant="ghost" icon={<X className="size-4" />} onClick={clearPending} disabled={upload.isPending}>
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
      <CameraCapture
        open={camera}
        onClose={() => setCamera(false)}
        title="Photograph document"
        tip="Place the document flat in good light, fill the frame and keep it sharp. Make sure all text, the GSTIN and any seal or signature are readable."
        allowMultiple={false}
        onUseNativeCamera={() => captureInput.current?.click()}
        onCapture={async (blob) => {
          if (blob.size > 8 * 1024 * 1024) return 'This photo is larger than 8 MB. Move a little further away and retake it.';
          choose(new File([blob], `document-${Date.now()}.jpg`, { type: 'image/jpeg' }), 'camera');
          return null;
        }}
      />
    </Panel>
  );
}

function Onboarding() {
  const q = useSupplier();
  const qc = useQueryClient();
  const submit = useMutation({
    mutationFn: () => api.post('/supplier/submit'),
    onSuccess: () => {
      toast({ tone: 'success', title: 'Application submitted', description: 'We will notify you once our team has reviewed it.' });
      void qc.invalidateQueries({ queryKey: ['supplier'] });
      void qc.invalidateQueries({ queryKey: ['auth'] });
    },
    onError: (e) => toast({ tone: 'error', title: 'Not submitted yet', description: errorMessage(e) }),
  });
  if (q.isLoading) return <PageLoader />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} />;
  const s = q.data!.supplier;
  const canSubmit = ['INCOMPLETE', 'REJECTED', 'INFO_REQUESTED'].includes(s.status);
  return (
    <>
      <PageHeader title="Supplier onboarding" description="Three steps: business details, documents, submit for review." />
      <StatusBanner s={s} showActions={false} />
      <div className="space-y-6">
        <Panel title="1. Business details">
          <SupplierProfileForm supplier={s} />
        </Panel>
        <Documents s={s} />
        <Panel title="3. Submit for review">
          {canSubmit ? (
            <>
              <p className="mb-4 text-sm text-muted">Once submitted, our team reviews your details and documents. New suppliers remain “pending” until approved — nothing is approved automatically.</p>
              <Button onClick={() => submit.mutate()} loading={submit.isPending} icon={<ShieldCheck className="size-4" />}>
                {s.status === 'INCOMPLETE' ? 'Submit application' : 'Resubmit application'}
              </Button>
            </>
          ) : (
            <p className="text-sm">
              Current status: <StatusBadge status={s.status} label={SUPPLIER_STATUS_LABELS[s.status]} />
            </p>
          )}
        </Panel>
      </div>
    </>
  );
}

// ─── Overview ────────────────────────────────────────────────────────────
function Overview() {
  const s = useSupplier();
  const q = useQuery({ queryKey: ['supplier', 'overview'], queryFn: () => api.get<{ status: string; counts: { products: number; openEnquiries: number; newOrders: number; activeOrders: number; byStatus: Record<string, number> } }>('/supplier/overview') });
  if (q.isLoading || s.isLoading) return <PageLoader />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} />;
  const c = q.data!.counts;
  return (
    <>
      <PageHeader title="Supplier dashboard" description={s.data?.supplier.businessName} actions={<ButtonLink to="/supplier/products/new" icon={<Plus className="size-4" />}>New listing</ButtonLink>} />
      {s.data && <StatusBanner s={s.data.supplier} />}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="New order requests" value={c.newOrders} to="/supplier/orders" icon={ClipboardList} />
        <StatCard label="Orders in progress" value={c.activeOrders} to="/supplier/orders" icon={Truck} />
        <StatCard label="Open enquiries" value={c.openEnquiries} to="/supplier/enquiries" icon={MessagesSquare} />
        <StatCard label="Listings" value={c.products} to="/supplier/products" icon={Package} />
      </div>
      {c.products > 0 && (
        <Panel title="Listings by status" className="mt-6">
          <div className="flex flex-wrap gap-3 text-sm">
            {Object.entries(c.byStatus).map(([k, v]) => (
              <span key={k} className="flex items-center gap-2">
                <StatusBadge status={k} /> {v}
              </span>
            ))}
          </div>
        </Panel>
      )}
    </>
  );
}

// ─── Products ────────────────────────────────────────────────────────────
type SupplierProductRow = { id: string; title: string; status: string; availability: string; pricePaise: number; priceUnit: string; moq: number; stockQuantity: number | null; updatedAt: string; category: { name: string }; images: { url: string }[]; variants: { id: string; size: string | null; colour: string | null; stockQuantity: number | null }[]; _count: { variants: number } };

/** Total units across tracked stock, or null if any part is untracked. */
function stockLabel(p: SupplierProductRow) {
  if (p.variants.length) {
    if (p.variants.some((v) => v.stockQuantity === null)) return 'Not tracked';
    return `${formatNumber(p.variants.reduce((s, v) => s + (v.stockQuantity ?? 0), 0))} in stock`;
  }
  return p.stockQuantity === null ? 'Not tracked' : `${formatNumber(p.stockQuantity)} in stock`;
}

function Products() {
  const q = useQuery({
    queryKey: ['supplier', 'products'],
    queryFn: () => api.get<{ products: SupplierProductRow[] }>('/supplier/products'),
  });
  return (
    <>
      <PageHeader title="Product management" description="Create listings with your prices, MOQ, sizes and photos." actions={<ButtonLink to="/supplier/products/new" icon={<Plus className="size-4" />}>New listing</ButtonLink>} />
      {q.isLoading ? (
        <PageLoader />
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} />
      ) : q.data!.products.length === 0 ? (
        <EmptyState icon={<Package className="size-7" />} title="No listings yet" description="Create your first product listing. It stays a private draft until you submit it and our team approves it." actions={<ButtonLink to="/supplier/products/new">Create a listing</ButtonLink>} />
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-white">
          {q.data!.products.map((p) => (
            <li key={p.id}>
              <Link to={`/supplier/products/${p.id}`} className="flex items-center gap-4 p-4 hover:bg-brand-50">
                <div className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-brand-50">
                  <SmartImage src={p.images[0]?.url ?? PLACEHOLDER_IMAGE.src} alt="" className="absolute inset-0 size-full object-cover" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{p.title}</div>
                  <div className="text-xs text-muted">
                    {p.category.name} · {formatINR(p.pricePaise)}/{PRICE_UNIT_SHORT[p.priceUnit]} · MOQ {formatNumber(p.moq)} · {p._count.variants} options · {stockLabel(p)}
                  </div>
                </div>
                <StatusBadge status={p.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

// ─── Inventory ───────────────────────────────────────────────────────────
function StockRow({ product }: { product: SupplierProductRow }) {
  const qc = useQueryClient();
  const toText = (n: number | null) => (n === null ? '' : String(n));
  const [own, setOwn] = useState(toText(product.stockQuantity));
  const [vals, setVals] = useState<Record<string, string>>(Object.fromEntries(product.variants.map((v) => [v.id, toText(v.stockQuantity)])));
  const parse = (t: string) => (t.trim() === '' ? null : Math.max(0, Number.parseInt(t, 10) || 0));
  const save = useMutation({
    mutationFn: () =>
      api.patch(`/supplier/products/${product.id}/stock`, {
        stockQuantity: product.variants.length ? null : parse(own),
        variants: product.variants.map((v) => ({ id: v.id, stockQuantity: parse(vals[v.id] ?? '') })),
      }),
    onSuccess: () => {
      toast({ tone: 'success', title: 'Stock updated', description: product.title });
      void qc.invalidateQueries({ queryKey: ['supplier', 'products'] });
    },
    onError: (e) => toast({ tone: 'error', title: 'Could not update stock', description: errorMessage(e) }),
  });
  const box = 'h-9 w-24 rounded-md border border-line-strong px-2 text-sm tabular-nums focus:border-copper-500 focus:outline-none';
  return (
    <li className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link to={`/supplier/products/${product.id}`} className="font-medium hover:text-copper-600">
          {product.title}
        </Link>
        <StatusBadge status={product.status} />
        <span className="text-xs text-muted">{stockLabel(product)}</span>
      </div>
      <form
        className="mt-3 flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        {product.variants.length === 0 ? (
          <label className="text-xs text-muted">
            Units in stock
            <input className={cn(box, 'mt-1 block')} inputMode="numeric" placeholder="Not tracked" value={own} onChange={(e) => setOwn(e.target.value.replace(/\D/g, ''))} aria-label={`Stock for ${product.title}`} />
          </label>
        ) : (
          product.variants.map((v) => (
            <label key={v.id} className="text-xs text-muted">
              {[v.size, v.colour].filter(Boolean).join(' / ')}
              <input
                className={cn(box, 'mt-1 block')}
                inputMode="numeric"
                placeholder="Not tracked"
                value={vals[v.id] ?? ''}
                onChange={(e) => setVals((s) => ({ ...s, [v.id]: e.target.value.replace(/\D/g, '') }))}
                aria-label={`Stock for ${[v.size, v.colour].filter(Boolean).join(' ')}`}
              />
            </label>
          ))
        )}
        <Button type="submit" size="sm" loading={save.isPending}>
          Save stock
        </Button>
      </form>
    </li>
  );
}

function Inventory() {
  const q = useQuery({ queryKey: ['supplier', 'products'], queryFn: () => api.get<{ products: SupplierProductRow[] }>('/supplier/products') });
  const products = (q.data?.products ?? []).filter((p) => p.status !== 'ARCHIVED');
  return (
    <>
      <PageHeader title="Stock management" description="Update available units. Stock changes take effect immediately and don't send live listings back to review. Leave a field empty if the item is made to order." />
      {q.isLoading ? (
        <PageLoader />
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} />
      ) : products.length === 0 ? (
        <EmptyState icon={<Boxes className="size-7" />} title="No listings to stock yet" actions={<ButtonLink to="/supplier/products/new">Create a listing</ButtonLink>} />
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-white">
          {products.map((p) => (
            <StockRow key={p.id} product={p} />
          ))}
        </ul>
      )}
    </>
  );
}

// ─── Enquiries ───────────────────────────────────────────────────────────
function Enquiries() {
  const qc = useQueryClient();
  const [replying, setReplying] = useState<string | null>(null);
  const [text, setText] = useState('');
  const q = useQuery({
    queryKey: ['supplier', 'enquiries'],
    queryFn: () => api.get<{ enquiries: { id: string; message: string; quantity: number | null; status: string; supplierResponse: string | null; createdAt: string; retailer: { businessName: string; city: string }; product: { id: string; title: string } | null }[] }>('/supplier/enquiries'),
  });
  const respond = useMutation({
    mutationFn: (id: string) => api.post(`/supplier/enquiries/${id}/respond`, { response: text }),
    onSuccess: () => {
      toast({ tone: 'success', title: 'Reply sent' });
      setReplying(null);
      setText('');
      void qc.invalidateQueries({ queryKey: ['supplier'] });
    },
  });
  return (
    <>
      <PageHeader title="Incoming enquiries" />
      {q.isLoading ? (
        <PageLoader />
      ) : q.data?.enquiries.length ? (
        <ul className="space-y-3">
          {q.data.enquiries.map((e) => (
            <li key={e.id} className="rounded-xl border border-line bg-white p-5">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold">{e.retailer.businessName}</span>
                <span className="text-muted">· {e.retailer.city}</span>
                {e.product && <span className="text-muted">· {e.product.title}</span>}
                <StatusBadge status={e.status} className="ml-auto" />
              </div>
              <p className="mt-2 text-sm whitespace-pre-line">{e.message}</p>
              <p className="mt-1 text-xs text-muted">{formatDate(e.createdAt)}{e.quantity ? ` · ${formatNumber(e.quantity)} pcs requested` : ''}</p>
              {e.supplierResponse && <div className="mt-3 rounded-lg bg-brand-50 p-3 text-sm">Your reply: {e.supplierResponse}</div>}
              {replying === e.id ? (
                <form className="mt-3 space-y-2" onSubmit={(ev) => { ev.preventDefault(); respond.mutate(e.id); }}>
                  {respond.error && <Alert tone="danger">{errorMessage(respond.error)}</Alert>}
                  <Textarea aria-label="Reply" value={text} onChange={(ev) => setText(ev.target.value)} data-autofocus />
                  <div className="flex gap-2">
                    <Button type="submit" size="sm" loading={respond.isPending} disabled={text.trim().length < 5}>Send reply</Button>
                    <Button size="sm" variant="subtle" onClick={() => setReplying(null)}>Cancel</Button>
                  </div>
                </form>
              ) : (
                <Button size="sm" variant="subtle" className="mt-3" onClick={() => { setReplying(e.id); setText(''); }}>
                  {e.supplierResponse ? 'Reply again' : 'Reply'}
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={<MessagesSquare className="size-7" />} title="No enquiries yet" description="Retailers' bulk enquiries about your listings will appear here." />
      )}
    </>
  );
}

// ─── Orders ──────────────────────────────────────────────────────────────
interface SupplierOrderRow {
  id: string;
  status: string;
  subtotalPaise: number;
  supplierNote: string | null;
  createdAt: string;
  order: { orderNumber: string; notes: string | null; createdAt: string; shippingAddress: Record<string, string>; retailer: { businessName: string; phone: string; city: string }; payments?: { status: string; verifiedAt: string | null }[] };
  items: { id: string; productTitle: string; variantLabel: string | null; quantity: number; unitPricePaise: number; priceUnit: string; lineTotalPaise: number }[];
  shipments: { id: string; carrier: string; trackingNumber: string; status: string; dispatchedAt: string }[];
}

function Orders() {
  const q = useQuery({ queryKey: ['supplier', 'orders'], queryFn: () => api.get<{ orders: SupplierOrderRow[] }>('/supplier/orders') });
  return (
    <>
      <PageHeader title="Order management" description="Bulk order requests from retailers. Confirm, process and dispatch." />
      {q.isLoading ? (
        <PageLoader />
      ) : q.data?.orders.length ? (
        <ul className="space-y-3">
          {q.data.orders.map((o) => (
            <li key={o.id}>
              <Link to={`/supplier/orders/${o.id}`} className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-white p-4 hover:shadow-[var(--shadow-card)]">
                <span className="font-semibold">{o.order.orderNumber}</span>
                <span className="text-sm text-muted">{o.order.retailer.businessName} · {o.order.retailer.city}</span>
                <StatusBadge status={o.status} />
                <span className="ml-auto font-medium">{formatINR(o.subtotalPaise)}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={<ClipboardList className="size-7" />} title="No orders have been placed yet." description="When retailers order your published listings, their requests appear here." />
      )}
    </>
  );
}

function OrderDetail() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['supplier', 'order', id], queryFn: () => api.get<{ order: SupplierOrderRow }>(`/supplier/orders/${id}`) });
  const [note, setNote] = useState('');
  const status = useMutation({
    mutationFn: (s: string) => api.post(`/supplier/orders/${id}/status`, { status: s, note: note || undefined }),
    onSuccess: () => {
      toast({ tone: 'success', title: 'Order updated' });
      void qc.invalidateQueries({ queryKey: ['supplier'] });
    },
    onError: (e) => toast({ tone: 'error', title: 'Update failed', description: errorMessage(e) }),
  });
  const dispatchForm = useForm<z.infer<typeof dispatchSchema>>({ resolver: zodResolver(dispatchSchema) });
  const dispatch = useMutation({
    mutationFn: (v: z.infer<typeof dispatchSchema>) => api.post(`/supplier/orders/${id}/dispatch`, v),
    onSuccess: () => {
      toast({ tone: 'success', title: 'Dispatch details shared with the retailer' });
      dispatchForm.reset();
      void qc.invalidateQueries({ queryKey: ['supplier'] });
    },
  });
  if (q.isLoading) return <PageLoader />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} />;
  const o = q.data!.order;
  const a = o.order.shippingAddress;
  const de = dispatchForm.formState.errors;
  return (
    <>
      <PageHeader title={`Order ${o.order.orderNumber}`} description={<>From {o.order.retailer.businessName} · {formatDate(o.createdAt)} · <StatusBadge status={o.status} /></>} />
      {(() => {
        const pay = o.order.payments?.[0];
        if (!pay) return null;
        const verified = pay.status === 'PAID' || pay.status === 'PARTIALLY_REFUNDED';
        return verified ? (
          <Alert tone="success" className="mb-5" title="Payment verified by Dhaaga Bazaar">
            The retailer&apos;s payment was verified{pay.verifiedAt ? ` on ${formatDate(pay.verifiedAt)}` : ''}. You may process and dispatch this order once you have confirmed it.
          </Alert>
        ) : (
          <Alert tone="warning" className="mb-5" title={`Payment: ${PAYMENT_STATUS_LABELS[pay.status] ?? pay.status}`}>
            You can confirm or reject this order now. Start processing or dispatch only after Dhaaga Bazaar has verified the retailer&apos;s payment — you&apos;ll be notified.
          </Alert>
        );
      })()}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-5">
          <Panel title="Items">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-line">
                {o.items.map((it) => (
                  <tr key={it.id}>
                    <td className="py-2">{it.productTitle}{it.variantLabel && <span className="block text-xs text-muted">{it.variantLabel}</span>}</td>
                    <td className="py-2 text-right tabular-nums">{formatNumber(it.quantity)} × {formatINR(it.unitPricePaise)}</td>
                    <td className="py-2 text-right font-medium tabular-nums">{formatINR(it.lineTotalPaise)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 flex justify-between border-t border-line pt-3 font-semibold"><span>Subtotal</span><span>{formatINR(o.subtotalPaise)}</span></div>
            {o.order.notes && <Alert tone="info" className="mt-4" title="Retailer notes">{o.order.notes}</Alert>}
          </Panel>
          {['CONFIRMED', 'PROCESSING', 'DISPATCHED'].includes(o.status) && (
            <Panel title="Dispatch details">
              {o.shipments.map((s) => (
                <p key={s.id} className="mb-2 text-sm"><Truck className="mr-1 inline size-4" /> {s.carrier} · {s.trackingNumber} · {formatDate(s.dispatchedAt)}</p>
              ))}
              <form className="grid gap-3 sm:grid-cols-2" onSubmit={dispatchForm.handleSubmit((v) => dispatch.mutate(v))} noValidate>
                {dispatch.error && <Alert tone="danger" className="sm:col-span-2">{errorMessage(dispatch.error)}</Alert>}
                <Input label="Courier / transporter" error={de.carrier?.message} {...dispatchForm.register('carrier')} />
                <Input label="Tracking / LR number" error={de.trackingNumber?.message} {...dispatchForm.register('trackingNumber')} />
                <Input label="Tracking link (optional)" wrapClassName="sm:col-span-2" error={de.trackingUrl?.message} {...dispatchForm.register('trackingUrl')} />
                <Button type="submit" loading={dispatch.isPending} className="sm:col-span-2 sm:w-fit">Mark dispatched</Button>
              </form>
            </Panel>
          )}
        </div>
        <aside className="space-y-4">
          <Panel title="Actions">
            <Textarea label="Note to retailer (optional)" value={note} onChange={(e) => setNote(e.target.value)} className="min-h-20" />
            <div className="mt-3 flex flex-wrap gap-2">
              {o.status === 'REQUESTED' && (
                <>
                  <Button size="sm" onClick={() => status.mutate('CONFIRMED')} loading={status.isPending}>Confirm order</Button>
                  <Button size="sm" variant="subtle" onClick={() => status.mutate('REJECTED')}>Decline</Button>
                </>
              )}
              {o.status === 'CONFIRMED' && <Button size="sm" variant="subtle" onClick={() => status.mutate('PROCESSING')}>Mark processing</Button>}
              {o.status === 'DISPATCHED' && <Button size="sm" onClick={() => status.mutate('DELIVERED')}>Mark delivered</Button>}
              {['CONFIRMED', 'PROCESSING'].includes(o.status) && <Button size="sm" variant="subtle" onClick={() => status.mutate('CANCELLED')}>Cancel</Button>}
              {['DELIVERED', 'REJECTED', 'CANCELLED'].includes(o.status) && <p className="text-sm text-muted">This order is {titleCase(o.status).toLowerCase()}.</p>}
            </div>
          </Panel>
          <Panel title="Deliver to">
            <p className="text-sm leading-relaxed">{a.contactName} · {a.phone}<br />{a.line1}{a.line2 ? `, ${a.line2}` : ''}<br />{a.city}, {a.state} {a.pincode}</p>
          </Panel>
        </aside>
      </div>
    </>
  );
}

function BusinessProfile() {
  const q = useSupplier();
  if (q.isLoading) return <PageLoader />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} />;
  return (
    <>
      <PageHeader title="Business profile" description="Public details retailers see on your supplier page." actions={q.data!.supplier.status === 'APPROVED' && <ButtonLink to={`/suppliers/${q.data!.supplier.id}`} variant="subtle" size="sm">View public profile</ButtonLink>} />
      <Panel>
        <SupplierProfileForm supplier={q.data!.supplier} />
      </Panel>
    </>
  );
}

export default function SupplierRoutes() {
  const q = useSupplier();
  const unread = useUnreadCount();
  const s = q.data?.supplier;
  const nav: NavItem[] = [
    { to: '/supplier', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/supplier/profile', label: 'Business profile', icon: Building2 },
    { to: '/supplier/onboarding', label: 'Verification documents', icon: ShieldCheck },
    { to: '/supplier/products', label: 'Products', icon: Package },
    { to: '/supplier/products/new', label: 'Add new product', icon: Plus, end: true },
    { to: '/supplier/ai-studio', label: 'Dhaaga Bazaar AI Studio', icon: Sparkles },
    { to: '/supplier/inventory', label: 'Stock management', icon: Boxes },
    { to: '/supplier/enquiries', label: 'Enquiries', icon: MessagesSquare },
    { to: '/supplier/orders', label: 'Orders & dispatch', icon: Truck },
    { to: '/supplier/notifications', label: 'Notifications', icon: Bell, badge: unread.data },
    { to: '/supplier/settings', label: 'Account settings', icon: Settings },
  ];
  if (q.isLoading) return <PageLoader />;
  return (
    <DashboardLayout title="Supplier Portal" subtitle={s?.businessName} nav={nav}>
      <Routes>
        <Route index element={s?.status === 'INCOMPLETE' ? <Navigate to="/supplier/onboarding" replace /> : <Overview />} />
        <Route path="onboarding" element={<Onboarding />} />
        <Route path="products" element={<Products />} />
        <Route path="products/:id" element={<ProductEditor supplierApproved={s?.status === 'APPROVED' || s?.status === 'PENDING_REVIEW' || s?.status === 'INFO_REQUESTED'} supplierName={s?.businessName} />} />
        <Route path="ai-studio" element={<AiStudioPage />} />
        <Route path="enquiries" element={<Enquiries />} />
        <Route path="orders" element={<Orders />} />
        <Route path="orders/:id" element={<OrderDetail />} />
        <Route path="notifications" element={<NotificationsView />} />
        <Route path="inventory" element={<Inventory />} />
        <Route path="settings" element={<AccountSettings />} />
        <Route path="profile" element={<BusinessProfile />} />
        <Route path="*" element={<EmptyState title="Page not found" actions={<ButtonLink to="/supplier">Back to dashboard</ButtonLink>} />} />
      </Routes>
    </DashboardLayout>
  );
}
