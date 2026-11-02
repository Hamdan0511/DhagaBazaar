import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Download, Eye, FileText, Search, ShieldCheck, Store } from 'lucide-react';
import { INDIAN_STATES, SUPPLIER_DOCUMENT_TYPES, SUPPLIER_STATUS_LABELS, formatNumber } from '@dhaaga/shared';
import { api, errorMessage } from '@/lib/api';
import { useCategories } from '@/lib/categories';
import { PageHeader, Panel } from '@/components/dashboard/DashboardLayout';
import { Alert, EmptyState, ErrorState, FixtureBadge, PageLoader, StatusBadge } from '@/components/ui/Feedback';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Overlay';
import { Pagination } from '@/components/ui/Pagination';
import { useConfirmDialog } from '@/components/ui/ConfirmDialog';
import { usePromptDialog } from '@/components/ui/PromptDialog';
import { cn, formatDate, titleCase } from '@/lib/utils';
import { toast } from '@/stores/ui';

const docLabel = (type: string) => SUPPLIER_DOCUMENT_TYPES.find((t) => t.value === type)?.label ?? titleCase(type);
const statusLabel = (s: string) => SUPPLIER_STATUS_LABELS[s] ?? titleCase(s);
export const SupplierStatus = ({ status, className }: { status: string; className?: string }) => <StatusBadge status={status} label={statusLabel(status)} className={className} />;
const dateTime = (d: string) => formatDate(d, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

interface SupplierRow {
  id: string;
  businessName: string;
  businessType: string;
  contactName: string;
  phone: string;
  gstin: string | null;
  city: string | null;
  state: string | null;
  status: string;
  isVerified: boolean;
  isFixture: boolean;
  submittedAt: string | null;
  createdAt: string;
  user: { email: string };
  _count: { documents: number; products: number };
}

type ListMode = 'applications' | 'approved' | 'rejected';
const MODES: Record<ListMode, { title: string; description: string; tabs: { value: string; label: string }[]; empty: string }> = {
  applications: {
    title: 'Supplier Applications',
    description: 'Businesses waiting for a decision. Oldest submissions first is the fairest order to review in.',
    tabs: [
      { value: 'PENDING_REVIEW', label: 'Pending review' },
      { value: 'INFO_REQUESTED', label: 'Additional info required' },
      { value: 'INCOMPLETE', label: 'Draft' },
      { value: '', label: 'All statuses' },
    ],
    empty: 'No supplier applications are waiting for review.',
  },
  approved: {
    title: 'Approved Suppliers',
    description: 'Suppliers who can publish listings. Suspended suppliers are listed here too.',
    tabs: [
      { value: 'APPROVED', label: 'Approved' },
      { value: 'SUSPENDED', label: 'Suspended' },
    ],
    empty: 'No suppliers have been approved yet.',
  },
  rejected: {
    title: 'Rejected Applications',
    description: 'Applications that were declined. Suppliers can update their details and resubmit.',
    tabs: [{ value: 'REJECTED', label: 'Rejected' }],
    empty: 'No applications have been rejected.',
  },
};

/** Supplier tables with search, filters, sort and pagination — all server-side. */
export function SupplierList({ mode }: { mode: ListMode }) {
  const cfg = MODES[mode];
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? cfg.tabs[0].value;
  const page = Number(params.get('page') ?? '1') || 1;
  const sort = params.get('sort') ?? (mode === 'applications' ? 'submitted_asc' : 'registered_desc');
  const businessType = params.get('type') ?? '';
  const state = params.get('state') ?? '';
  const [search, setSearch] = useState(params.get('q') ?? '');
  const q = params.get('q') ?? '';
  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!('page' in patch)) next.delete('page');
    setParams(next, { replace: true });
  };
  useEffect(() => {
    const t = setTimeout(() => search !== q && set({ q: search }), 350);
    return () => clearTimeout(t);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps
  const qs = new URLSearchParams({ sort, page: String(page), pageSize: '20', ...(status ? { status } : {}), ...(q ? { q } : {}), ...(businessType ? { businessType } : {}), ...(state ? { state } : {}) });
  const query = useQuery({
    queryKey: ['admin', 'suppliers', qs.toString()],
    queryFn: () => api.get<{ suppliers: SupplierRow[]; total: number; page: number; pageSize: number; statusCounts: Record<string, number> }>(`/admin/suppliers?${qs}`),
    placeholderData: keepPreviousData,
  });
  const counts = query.data?.statusCounts ?? {};
  const allCount = Object.values(counts).reduce((a, b) => a + b, 0);
  return (
    <>
      <PageHeader title={cfg.title} description={cfg.description} />
      {cfg.tabs.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Application status">
          {cfg.tabs.map((t) => (
            <button
              key={t.value || 'all'}
              role="tab"
              aria-selected={status === t.value}
              onClick={() => set({ status: t.value || '' })}
              className={cn('rounded-full border px-3.5 py-1.5 text-sm font-medium', status === t.value ? 'border-brand-900 bg-brand-900 text-white' : 'border-line-strong bg-white text-charcoal hover:border-brand-900')}
            >
              {t.label} <span className="ml-1 tabular-nums opacity-70">{t.value ? counts[t.value] ?? 0 : allCount}</span>
            </button>
          ))}
        </div>
      )}
      <div className="mb-4 grid gap-3 rounded-xl border border-line bg-white p-4 md:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))]">
        <label className="relative block">
          <span className="sr-only">Search suppliers</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search business, contact, email, phone, GSTIN, city"
            className="h-11 w-full rounded-md border border-line-strong bg-white pr-3 pl-9 text-sm focus:border-copper-500 focus:outline-none"
          />
        </label>
        <Select aria-label="Business type" value={businessType} onChange={(e) => set({ type: e.target.value })}>
          <option value="">All business types</option>
          {['MANUFACTURER', 'WHOLESALER', 'DISTRIBUTOR'].map((t) => (
            <option key={t} value={t}>
              {titleCase(t)}
            </option>
          ))}
        </Select>
        <Select aria-label="State" value={state} onChange={(e) => set({ state: e.target.value })}>
          <option value="">All states</option>
          {INDIAN_STATES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </Select>
        <Select aria-label="Sort" value={sort} onChange={(e) => set({ sort: e.target.value })}>
          <option value="submitted_asc">Submitted · oldest first</option>
          <option value="submitted_desc">Submitted · newest first</option>
          <option value="registered_desc">Registered · newest first</option>
          <option value="registered_asc">Registered · oldest first</option>
          <option value="name">Business name A–Z</option>
        </Select>
      </div>
      {query.isLoading ? (
        <PageLoader />
      ) : query.isError ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />
      ) : query.data!.suppliers.length === 0 ? (
        <EmptyState icon={<Store className="size-7" />} title={q || businessType || state ? 'No suppliers match these filters.' : cfg.empty} />
      ) : (
        <>
          <div className="relative overflow-x-auto rounded-xl border border-line bg-white">
            <table className="w-full min-w-[64rem] text-sm [&_td]:px-3 [&_th]:px-3">
              <thead className="bg-brand-50 text-left text-xs tracking-wide text-muted uppercase">
                <tr>
                  {['Business', 'Contact person', 'Email', 'Phone', 'Type', 'City / State', 'GSTIN', 'Registered', 'Status', ''].map((h) => (
                    <th key={h} className="px-4 py-3 font-semibold whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {query.data!.suppliers.map((s) => (
                  <tr key={s.id} className="align-top hover:bg-brand-50/60">
                    <td className="max-w-[12rem] px-4 py-3">
                      <Link to={`/admin/suppliers/${s.id}`} className="font-semibold text-brand-900 hover:text-copper-600 hover:underline">
                        {s.businessName}
                      </Link>
                      <div className="mt-0.5 text-xs text-muted">
                        {s._count.documents} document{s._count.documents === 1 ? '' : 's'} · {s._count.products} listing{s._count.products === 1 ? '' : 's'}
                      </div>
                      {s.isFixture && <FixtureBadge className="mt-1" />}
                    </td>
                    <td className="px-4 py-3">{s.contactName}</td>
                    <td className="max-w-[13rem] px-4 py-3 text-[0.8125rem] [overflow-wrap:anywhere]">{s.user.email}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{s.phone}</td>
                    <td className="px-4 py-3">{titleCase(s.businessType)}</td>
                    <td className="px-4 py-3">
                      {s.city ?? '—'}
                      <div className="text-xs text-muted">{s.state ?? '—'}</div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{s.gstin ?? <span className="font-sans text-muted">Not registered</span>}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {formatDate(s.createdAt)}
                      {s.submittedAt && <div className="text-xs text-muted">Submitted {formatDate(s.submittedAt)}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <SupplierStatus status={s.status} />
                      {s.isVerified && <StatusBadge status="APPROVED" label="Documents verified" className="mt-1" />}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link to={`/admin/suppliers/${s.id}`} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-brand-900/70 px-3 font-medium whitespace-nowrap text-brand-900 hover:bg-brand-900 hover:text-white">
                        <Eye className="size-4" aria-hidden /> View<span className="sr-only"> application for {s.businessName}</span>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination className="mt-4" page={query.data!.page} pageSize={query.data!.pageSize} total={query.data!.total} onPage={(p) => set({ page: String(p) })} />
        </>
      )}
    </>
  );
}

interface DocumentRow {
  id: string;
  type: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  status: string;
  reviewNote: string | null;
  uploadedAt: string;
  reviewedAt?: string | null;
}

/** Secure preview: the file is streamed by the admin-only API route, never from a public URL. */
export function DocumentPreview({ doc, onClose }: { doc: DocumentRow | null; onClose: () => void }) {
  const src = doc ? `/api/admin/documents/${doc.id}/file` : '';
  return (
    <Modal open={!!doc} onClose={onClose} title={doc ? `${docLabel(doc.type)} — ${doc.fileName}` : undefined} className="sm:max-w-4xl">
      {doc && (
        <div className="p-4 sm:p-6">
          <div className="overflow-hidden rounded-lg border border-line bg-brand-50">
            {doc.mimeType === 'application/pdf' ? (
              <iframe src={src} title={`Preview of ${doc.fileName}`} className="h-[70vh] w-full bg-white" />
            ) : (
              <img src={src} alt={`Uploaded ${docLabel(doc.type)}`} className="mx-auto max-h-[70vh] w-auto object-contain" />
            )}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
            <span>
              {doc.mimeType === 'application/pdf' ? 'PDF' : doc.mimeType.split('/')[1].toUpperCase()} · {kb(doc.sizeBytes)} · uploaded {dateTime(doc.uploadedAt)}
            </span>
            <a href={`${src}?download=1`} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line-strong px-3 font-medium text-charcoal hover:bg-brand-50">
              <Download className="size-4" aria-hidden /> Download
            </a>
          </div>
          <p className="mt-3 text-xs text-muted">Viewing and downloading is recorded in the audit log. An uploaded document is not proof of verification until you accept it.</p>
        </div>
      )}
    </Modal>
  );
}

function DocumentActions({ doc, onPreview }: { doc: DocumentRow; onPreview: () => void }) {
  const qc = useQueryClient();
  const prompt = usePromptDialog();
  const review = useMutation({
    mutationFn: ({ status, note }: { status: string; note?: string }) => api.post(`/admin/documents/${doc.id}/review`, { status, note }),
    onSuccess: (_d, v) => {
      toast({ tone: 'success', title: v.status === 'ACCEPTED' ? 'Document accepted' : 'Document rejected' });
      void qc.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: (e) => toast({ tone: 'error', title: errorMessage(e) }),
  });
  return (
    <span className="flex flex-wrap gap-2">
      {prompt.element}
      <Button size="sm" variant="subtle" icon={<Eye className="size-4" />} onClick={onPreview}>
        Preview
      </Button>
      {doc.status !== 'ACCEPTED' && (
        <Button size="sm" onClick={() => review.mutate({ status: 'ACCEPTED' })} loading={review.isPending && review.variables?.status === 'ACCEPTED'}>
          Accept
        </Button>
      )}
      {doc.status !== 'REJECTED' && (
        <Button
          size="sm"
          variant="subtle"
          onClick={async () => {
            const note = await prompt.ask({ title: 'Reject document', label: 'Reason shown to the supplier', multiline: true, confirmLabel: 'Reject document' });
            if (note) review.mutate({ status: 'REJECTED', note });
          }}
        >
          Reject
        </Button>
      )}
    </span>
  );
}

/** Pending verification documents across all suppliers. */
export function DocumentsQueue() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? 'PENDING';
  const page = Number(params.get('page') ?? '1') || 1;
  const [preview, setPreview] = useState<DocumentRow | null>(null);
  const q = useQuery({
    queryKey: ['admin', 'documents', status, page],
    queryFn: () => api.get<{ documents: (DocumentRow & { supplier: { id: string; businessName: string; status: string; city: string | null } })[]; total: number; page: number; pageSize: number }>(`/admin/documents?status=${status}&page=${page}`),
    placeholderData: keepPreviousData,
  });
  return (
    <>
      <PageHeader title="Verification Documents" description="Business documents uploaded by suppliers. Accept only genuine, legible documents — acceptance is what allows the “documents verified” mark." />
      <div className="mb-4 flex flex-wrap gap-2">
        {[
          ['PENDING', 'Awaiting review'],
          ['ACCEPTED', 'Accepted'],
          ['REJECTED', 'Rejected'],
          ['ALL', 'All'],
        ].map(([v, l]) => (
          <button key={v} onClick={() => setParams({ status: v })} className={cn('rounded-full border px-3.5 py-1.5 text-sm font-medium', status === v ? 'border-brand-900 bg-brand-900 text-white' : 'border-line-strong bg-white')}>
            {l}
          </button>
        ))}
      </div>
      {q.isLoading ? (
        <PageLoader />
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} />
      ) : q.data!.documents.length === 0 ? (
        <EmptyState icon={<FileText className="size-7" />} title="No documents in this view." description="Documents appear here when suppliers upload them from their business profile." />
      ) : (
        <>
          <div className="relative overflow-x-auto rounded-xl border border-line bg-white">
            <table className="w-full min-w-[56rem] text-sm">
              <thead className="bg-brand-50 text-left text-xs tracking-wide text-muted uppercase">
                <tr>
                  {['Document', 'Supplier', 'Uploaded', 'Size', 'Status', 'Actions'].map((h) => (
                    <th key={h} className="px-4 py-3 font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {q.data!.documents.map((d) => (
                  <tr key={d.id} className="align-top">
                    <td className="px-4 py-3">
                      <div className="font-medium">{docLabel(d.type)}</div>
                      <div className="text-xs break-all text-muted">{d.fileName}</div>
                      {d.reviewNote && <div className="mt-1 text-xs text-danger">Note: {d.reviewNote}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <Link to={`/admin/suppliers/${d.supplier.id}`} className="font-medium text-copper-600 hover:underline">
                        {d.supplier.businessName}
                      </Link>
                      <div className="mt-1">
                        <SupplierStatus status={d.supplier.status} />
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{dateTime(d.uploadedAt)}</td>
                    <td className="px-4 py-3">{kb(d.sizeBytes)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={d.status} label={d.status === 'PENDING' ? 'Awaiting review' : undefined} />
                    </td>
                    <td className="px-4 py-3">
                      <DocumentActions doc={d} onPreview={() => setPreview(d)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination className="mt-4" page={q.data!.page} pageSize={q.data!.pageSize} total={q.data!.total} onPage={(p) => setParams({ status, page: String(p) })} />
        </>
      )}
      <DocumentPreview doc={preview} onClose={() => setPreview(null)} />
    </>
  );
}

interface SupplierDetailData {
  supplier: {
    id: string;
    businessName: string;
    businessType: string;
    contactName: string;
    phone: string;
    whatsapp: string | null;
    gstin: string | null;
    yearEstablished: number | null;
    description: string | null;
    addressLine: string | null;
    city: string | null;
    state: string | null;
    pincode: string | null;
    categoryPaths: string[];
    minOrderValuePaise: number | null;
    status: string;
    isVerified: boolean;
    isFixture: boolean;
    verifiedAt: string | null;
    rejectionReason: string | null;
    infoRequest: string | null;
    submittedAt: string | null;
    reviewedAt: string | null;
    approvedAt: string | null;
    createdAt: string;
    user: { email: string; fullName: string; phone: string | null; createdAt: string; lastLoginAt: string | null };
    documents: DocumentRow[];
    products: { id: string; title: string; status: string }[];
  };
  reviewer: { email: string; fullName: string } | null;
  history: { id: string; action: string; metadata: Record<string, unknown> | null; createdAt: string; actor: { email: string } | null }[];
}

const ACTION_LABELS: Record<string, string> = {
  'supplier.registered': 'Registered',
  'user.registered': 'Registered',
  'supplier.submitted': 'Application submitted',
  'supplier.resubmitted': 'Application resubmitted',
  'supplier.approved': 'Application approved',
  'supplier.rejected': 'Application rejected',
  'supplier.info_requested': 'Additional information requested',
  'supplier.suspended': 'Supplier suspended',
  'supplier.verified': 'Marked documents verified',
  'supplier.unverified': 'Verification removed',
  'document.accepted': 'Document accepted',
  'document.rejected': 'Document rejected',
  'document.viewed': 'Document viewed',
  'document.downloaded': 'Document downloaded',
};

export function SupplierApplication() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const cats = useCategories();
  const { confirm, element: confirmElement } = useConfirmDialog();
  const [preview, setPreview] = useState<DocumentRow | null>(null);
  const q = useQuery({ queryKey: ['admin', 'supplier', id], queryFn: () => api.get<SupplierDetailData>(`/admin/suppliers/${id}`) });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin'] });
  const decide = useMutation({
    mutationFn: (v: { decision: string; reason?: string }) => api.post(`/admin/suppliers/${id}/decision`, v),
    onSuccess: (_d, v) => {
      const titles: Record<string, string> = { APPROVED: 'Application approved', REJECTED: 'Application rejected', INFO_REQUESTED: 'Information requested', SUSPENDED: 'Supplier suspended' };
      toast({ tone: 'success', title: titles[v.decision], description: 'The supplier has been notified.' });
      void invalidate();
    },
    onError: (e) => toast({ tone: 'error', title: 'Could not update the application', description: errorMessage(e) }),
  });
  const verify = useMutation({
    mutationFn: (verified: boolean) => api.post(`/admin/suppliers/${id}/verification`, { verified }),
    onSuccess: () => {
      toast({ tone: 'success', title: 'Verification updated' });
      void invalidate();
    },
    onError: (e) => toast({ tone: 'error', title: errorMessage(e) }),
  });
  if (q.isLoading) return <PageLoader />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  const { supplier: s, reviewer, history } = q.data!;
  const reviewable = ['PENDING_REVIEW', 'INFO_REQUESTED'].includes(s.status);
  const field = (label: string, value: React.ReactNode, wide = false) => (
    <div className={wide ? 'sm:col-span-2' : undefined}>
      <dt className="text-xs font-medium tracking-wide text-muted uppercase">{label}</dt>
      <dd className="mt-0.5 text-[0.9375rem] break-words text-charcoal">{value || <span className="text-muted">Not provided</span>}</dd>
    </div>
  );
  const approve = async () => {
    const ok = await confirm({
      title: `Approve ${s.businessName}?`,
      body: (
        <>
          The supplier will be notified and can start submitting product listings for review. Approval does <strong>not</strong> mark their documents as verified — do that separately after accepting genuine documents.
        </>
      ),
      confirmLabel: 'Approve application',
    });
    if (ok) decide.mutate({ decision: 'APPROVED' });
  };
  const withReason = async (decision: 'REJECTED' | 'INFO_REQUESTED' | 'SUSPENDED') => {
    const cfg = {
      REJECTED: { title: `Reject ${s.businessName}?`, label: 'Rejection reason', confirmLabel: 'Reject application', tone: 'danger' as const, body: 'The reason is saved on the application and sent to the supplier. They can update their details and resubmit.' },
      INFO_REQUESTED: { title: 'Request additional information', label: 'What does the supplier need to add or correct?', confirmLabel: 'Send request', tone: 'primary' as const, body: 'The application moves to “Additional Information Required” and the supplier is asked to update and resubmit.' },
      SUSPENDED: { title: `Suspend ${s.businessName}?`, label: 'Reason for suspension', confirmLabel: 'Suspend supplier', tone: 'danger' as const, body: 'Their listings stop appearing in the marketplace until they are approved again.' },
    }[decision];
    const ok = await confirm({ title: cfg.title, body: cfg.body, confirmLabel: cfg.confirmLabel, tone: cfg.tone, reason: { label: cfg.label } });
    if (ok) decide.mutate({ decision, reason: ok.reason });
  };
  return (
    <>
      {confirmElement}
      <Link to="/admin/applications" className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-copper-600 hover:text-brand-900">
        <ArrowLeft className="size-4" aria-hidden /> Supplier applications
      </Link>
      <PageHeader
        title={s.businessName}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <SupplierStatus status={s.status} />
            {s.isVerified && <StatusBadge status="APPROVED" label="Documents verified" />}
            {s.isFixture && <FixtureBadge />}
            <span className="text-muted">Registered {formatDate(s.createdAt)}</span>
          </span>
        }
      />
      {s.status === 'REJECTED' && s.rejectionReason && <Alert tone="danger" className="mb-5" title="Rejection reason on record">{s.rejectionReason}</Alert>}
      {s.status === 'SUSPENDED' && s.rejectionReason && <Alert tone="danger" className="mb-5" title="Suspension reason on record">{s.rejectionReason}</Alert>}
      {s.status === 'INFO_REQUESTED' && s.infoRequest && <Alert tone="info" className="mb-5" title="Information requested from the supplier">{s.infoRequest}</Alert>}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-5">
          <Panel title="Business information">
            <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
              {field('Registered business name', s.businessName)}
              {field('Business type', titleCase(s.businessType))}
              {field('Contact person', s.contactName)}
              {field('Account holder', `${s.user.fullName}`)}
              {field('Business email', <a href={`mailto:${s.user.email}`} className="link">{s.user.email}</a>)}
              {field('Business phone', s.phone)}
              {field('WhatsApp number', s.whatsapp)}
              {field('GSTIN', s.gstin ? <span className="font-mono">{s.gstin}</span> : 'Not GST registered')}
              {field('Full business address', [s.addressLine, s.city, s.state, s.pincode].filter(Boolean).join(', '), true)}
              {field('City', s.city)}
              {field('State', s.state)}
              {field('PIN code', s.pincode)}
              {field('Year established', s.yearEstablished)}
              {field('Business description', s.description && <span className="whitespace-pre-line">{s.description}</span>, true)}
              {field(
                'Product categories',
                s.categoryPaths.length ? (
                  <span className="flex flex-wrap gap-1.5 pt-1">
                    {s.categoryPaths.map((p) => (
                      <span key={p} className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-900 ring-1 ring-line">
                        {cats.get(p)?.name ?? p}
                      </span>
                    ))}
                  </span>
                ) : null,
                true,
              )}
            </dl>
          </Panel>
          <Panel title="Verification information">
            {s.documents.length === 0 ? (
              <p className="text-sm text-muted">No business documents have been uploaded. Documents are optional for the application but required before you can mark the supplier as verified.</p>
            ) : (
              <ul className="divide-y divide-line">
                {s.documents.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-start gap-3 py-3.5 first:pt-0 last:pb-0">
                    <FileText className="mt-0.5 size-5 shrink-0 text-copper-600" aria-hidden />
                    <div className="min-w-0 flex-1 text-sm">
                      <div className="font-medium">{docLabel(d.type)}</div>
                      <div className="text-xs break-all text-muted">
                        {d.fileName} · {kb(d.sizeBytes)} · uploaded {dateTime(d.uploadedAt)}
                      </div>
                      {d.reviewNote && <div className="mt-1 text-xs text-danger">Review note: {d.reviewNote}</div>}
                    </div>
                    <StatusBadge status={d.status} label={d.status === 'PENDING' ? 'Not yet verified' : d.status === 'ACCEPTED' ? 'Accepted' : 'Rejected'} />
                    <DocumentActions doc={d} onPreview={() => setPreview(d)} />
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Listings">
            {s.products.length ? (
              <ul className="space-y-2 text-sm">
                {s.products.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3">
                    <span className="truncate">{p.title}</span>
                    <StatusBadge status={p.status} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">No listings yet.</p>
            )}
          </Panel>
        </div>
        <aside className="space-y-5">
          <Panel title="Decision">
            <dl className="mb-4 space-y-2 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-muted">Status</dt><dd><SupplierStatus status={s.status} /></dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted">Submitted</dt><dd>{s.submittedAt ? dateTime(s.submittedAt) : '—'}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted">Last reviewed</dt><dd>{s.reviewedAt ? dateTime(s.reviewedAt) : '—'}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted">Reviewed by</dt><dd className="truncate">{reviewer?.email ?? '—'}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted">Approved on</dt><dd>{s.approvedAt ? dateTime(s.approvedAt) : '—'}</dd></div>
            </dl>
            <div className="grid gap-2">
              {s.status === 'INCOMPLETE' && <p className="text-sm text-muted">This supplier hasn&apos;t submitted their application yet.</p>}
              {(reviewable || s.status === 'REJECTED' || s.status === 'SUSPENDED') && (
                <Button onClick={approve} loading={decide.isPending && decide.variables?.decision === 'APPROVED'}>
                  {s.status === 'SUSPENDED' ? 'Reinstate supplier' : 'Approve Application'}
                </Button>
              )}
              {reviewable && (
                <Button variant="danger" onClick={() => withReason('REJECTED')} loading={decide.isPending && decide.variables?.decision === 'REJECTED'}>
                  Reject Application
                </Button>
              )}
              {s.status === 'PENDING_REVIEW' && (
                <Button variant="outline" onClick={() => withReason('INFO_REQUESTED')} loading={decide.isPending && decide.variables?.decision === 'INFO_REQUESTED'}>
                  Request Additional Information
                </Button>
              )}
              {s.status === 'INFO_REQUESTED' && <p className="text-xs text-muted">Waiting for the supplier to update their details and resubmit.</p>}
              {s.status === 'APPROVED' && (
                <Button variant="subtle" onClick={() => withReason('SUSPENDED')}>
                  Suspend supplier
                </Button>
              )}
            </div>
          </Panel>
          <Panel title="Documents verified mark">
            <p className="mb-3 text-xs leading-relaxed text-muted">Retailers see “documents verified” only when you set it. It needs an approved supplier and at least one accepted document.</p>
            {s.isVerified ? (
              <Button size="sm" variant="subtle" onClick={() => verify.mutate(false)}>
                Remove verification
              </Button>
            ) : (
              <Button size="sm" variant="outline" icon={<ShieldCheck className="size-4" />} onClick={() => verify.mutate(true)} disabled={s.status !== 'APPROVED' || !s.documents.some((d) => d.status === 'ACCEPTED')}>
                Mark documents verified
              </Button>
            )}
          </Panel>
          <Panel title="Review history">
            {history.length === 0 ? (
              <p className="text-sm text-muted">No recorded actions yet.</p>
            ) : (
              <ol className="space-y-3 text-sm">
                {history.map((h) => (
                  <li key={h.id} className="border-l-2 border-gold-400/60 pl-3">
                    <div className="font-medium">{ACTION_LABELS[h.action] ?? h.action}</div>
                    <div className="text-xs text-muted">
                      {dateTime(h.createdAt)} · {h.actor?.email ?? 'system'}
                    </div>
                    {typeof h.metadata?.reason === 'string' && h.metadata.reason && <div className="mt-1 text-xs text-charcoal/80">“{h.metadata.reason}”</div>}
                  </li>
                ))}
              </ol>
            )}
          </Panel>
          <p className="text-xs text-muted">
            Account email {s.user.email} · last sign-in {s.user.lastLoginAt ? dateTime(s.user.lastLoginAt) : 'never'} · {formatNumber(s.products.length)} listing(s)
          </p>
        </aside>
      </div>
      <DocumentPreview doc={preview} onClose={() => setPreview(null)} />
    </>
  );
}
