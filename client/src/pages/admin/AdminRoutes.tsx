import { useEffect, useState } from 'react';
import { Link, Navigate, Route, Routes, useParams, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BadgeIndianRupee,
  ClipboardCheck,
  FileCheck2,
  ImageOff,
  Inbox,
  LifeBuoy,
  Package,
  PackageCheck,
  Search,
  ShoppingBag,
  Store,
  UserCheck,
  Users,
  CircleSlash,
  Clock,
} from 'lucide-react';
import { FILTER_SETS, formatINR, formatNumber, PRICE_UNIT_SHORT } from '@dhaaga/shared';
import { api, errorMessage } from '@/lib/api';
import { getCategoryImage } from '@/lib/images';
import { NotificationsView, PageHeader, Panel } from '@/components/dashboard/DashboardLayout';
import { Alert, EmptyState, ErrorState, FixtureBadge, PageLoader, StatusBadge } from '@/components/ui/Feedback';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { Pagination } from '@/components/ui/Pagination';
import { useConfirmDialog } from '@/components/ui/ConfirmDialog';
import { cn, formatDate, titleCase } from '@/lib/utils';
import { toast } from '@/stores/ui';
import { usePromptDialog } from '@/components/ui/PromptDialog';
import { AccountSettings } from '@/components/dashboard/AccountSettings';
import { AdminLayout, useAdminCounts } from './AdminLayout';
import { DocumentsQueue, SupplierApplication, SupplierList, SupplierStatus } from './SupplierReview';

const useInvalidate = () => {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['admin'] });
};

/** Debounced text search bound to the ?q= URL parameter. */
function SearchBox({ placeholder }: { placeholder: string }) {
  const [params, setParams] = useSearchParams();
  const [value, setValue] = useState(params.get('q') ?? '');
  useEffect(() => {
    const t = setTimeout(() => {
      if (value === (params.get('q') ?? '')) return;
      const next = new URLSearchParams(params);
      if (value) next.set('q', value);
      else next.delete('q');
      next.delete('page');
      setParams(next, { replace: true });
    }, 350);
    return () => clearTimeout(t);
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <label className="relative mb-4 block max-w-xl">
      <span className="sr-only">{placeholder}</span>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
      <input type="search" value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} className="h-11 w-full rounded-md border border-line-strong bg-white pr-3 pl-9 text-sm focus:border-copper-500 focus:outline-none" />
    </label>
  );
}

const usePage = () => {
  const [params, setParams] = useSearchParams();
  const page = Number(params.get('page') ?? '1') || 1;
  const setPage = (p: number) => {
    const next = new URLSearchParams(params);
    next.set('page', String(p));
    setParams(next);
  };
  return { page, setPage, q: params.get('q') ?? '' };
};

// ─── Overview ────────────────────────────────────────────────────────────
function Stat({ label, value, to, icon: Icon, tone = 'default' }: { label: string; value: number; to?: string; icon: typeof Store; tone?: 'default' | 'attention' }) {
  const body = (
    <div className={cn('flex h-full items-start justify-between gap-3 rounded-xl border bg-white p-4 sm:p-5 transition-shadow hover:shadow-[var(--shadow-card)]', tone === 'attention' && value > 0 ? 'border-copper-400' : 'border-line')}>
      <div>
        <div className="text-xs font-semibold tracking-wide text-muted uppercase">{label}</div>
        <div className="mt-2 text-3xl font-semibold tracking-tight text-brand-900 tabular-nums">{formatNumber(value)}</div>
      </div>
      <span className={cn('hidden size-10 shrink-0 sm:flex items-center justify-center rounded-full', tone === 'attention' && value > 0 ? 'bg-copper-500 text-white' : 'bg-ivory text-copper-600')}>
        <Icon className="size-5" aria-hidden />
      </span>
    </div>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

function Overview() {
  const q = useAdminCounts();
  if (q.isLoading) return <PageLoader />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  const d = q.data as unknown as {
    stats: Record<string, number>;
    awaitingReview: { id: string; businessName: string; city: string | null; status: string; submittedAt: string | null; createdAt: string }[];
  };
  const s = d.stats;
  return (
    <>
      <PageHeader title="Overview" description="Live figures from the marketplace database. Development fixtures are excluded; empty means zero." />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat label="Total suppliers" value={s.totalSuppliers} to="/admin/applications?status=" icon={Store} />
        <Stat label="Pending supplier applications" value={s.pendingSuppliers} to="/admin/applications" icon={ClipboardCheck} tone="attention" />
        <Stat label="Approved suppliers" value={s.approvedSuppliers} to="/admin/suppliers/approved" icon={UserCheck} />
        <Stat label="Rejected applications" value={s.rejectedSuppliers} to="/admin/suppliers/rejected" icon={CircleSlash} />
        <Stat label="Total retailers" value={s.totalRetailers} to="/admin/retailers" icon={Users} />
        <Stat label="Published products" value={s.publishedProducts} to="/admin/products/live" icon={Package} />
        <Stat label="Pending product approvals" value={s.pendingProducts} to="/admin/products/pending" icon={PackageCheck} tone="attention" />
        <Stat label="Total genuine orders" value={s.genuineOrders} to="/admin/orders" icon={ShoppingBag} />
      </div>
      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Panel title="Waiting for review" actions={<Link to="/admin/applications" className="text-sm font-medium text-copper-600 hover:underline">All applications</Link>}>
          {d.awaitingReview.length === 0 ? (
            <p className="text-sm text-muted">No supplier applications are waiting for review.</p>
          ) : (
            <ul className="divide-y divide-line">
              {d.awaitingReview.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <Link to={`/admin/suppliers/${a.id}`} className="font-medium text-brand-900 hover:text-copper-600">
                    {a.businessName}
                  </Link>
                  <span className="text-sm text-muted">{a.city ?? '—'}</span>
                  <span className="ml-auto flex items-center gap-2 text-xs text-muted">
                    <Clock className="size-3.5" aria-hidden /> {formatDate(a.submittedAt ?? a.createdAt)}
                    <SupplierStatus status={a.status} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Other queues">
          <ul className="space-y-3 text-sm">
            {[
              ['Verification documents awaiting review', s.pendingDocuments, '/admin/documents', FileCheck2],
              ['Applications awaiting supplier updates', s.infoRequestedSuppliers, '/admin/applications?status=INFO_REQUESTED', ClipboardCheck],
              ['Suppliers with verified documents', s.verifiedSuppliers, '/admin/suppliers/approved', UserCheck],
              ['Open complaints', s.openComplaints, '/admin/complaints', LifeBuoy],
              ['Unhandled contact messages', s.unhandledMessages, '/admin/messages', Inbox],
            ].map(([label, value, to, Icon]) => {
              const I = Icon as typeof Store;
              return (
                <li key={label as string}>
                  <Link to={to as string} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-brand-50">
                    <I className="size-4 text-copper-600" aria-hidden />
                    <span className="flex-1">{label as string}</span>
                    <span className="font-semibold tabular-nums">{formatNumber(value as number)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>
    </>
  );
}

// ─── Products ────────────────────────────────────────────────────────────
interface AdminProduct {
  id: string;
  title: string;
  description: string;
  status: string;
  pricePaise: number;
  priceUnit: string;
  moq: number;
  stockQuantity: number | null;
  rejectionReason: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  updatedAt: string;
  attributes: Record<string, string[]>;
  isFixture: boolean;
  supplier: { id: string; businessName: string; status: string };
  category: { name: string; path: string };
  images: { id: string; url: string; usageRights: string; attribution: string | null; width: number | null; height: number | null }[];
  variants: { id: string; size: string | null; colour: string | null; stockQuantity: number | null }[];
}

const PRODUCT_VIEWS = {
  pending: { title: 'Product Approvals', description: 'Listings submitted by suppliers. Check photos, category, price and MOQ before publishing.', empty: 'No listings are waiting for approval.' },
  live: { title: 'Live Products', description: 'Published listings retailers can see and order. Unpublish anything that breaks marketplace rules.', empty: 'No products are published yet.' },
  unpublished: { title: 'Unpublished Products', description: 'Drafts, listings sent back for changes, taken down or archived. None of these are visible to retailers.', empty: 'No unpublished listings.' },
} as const;

function Products() {
  const { view = 'pending' } = useParams();
  const cfg = PRODUCT_VIEWS[view as keyof typeof PRODUCT_VIEWS];
  const invalidate = useInvalidate();
  const { page, setPage, q } = usePage();
  const { confirm, element } = useConfirmDialog();
  const query = useQuery({
    queryKey: ['admin', 'products', view, page, q],
    queryFn: () => api.get<{ products: AdminProduct[]; total: number; page: number; pageSize: number }>(`/admin/products?view=${view}&page=${page}${q ? `&q=${encodeURIComponent(q)}` : ''}`),
    placeholderData: keepPreviousData,
    enabled: !!cfg,
  });
  const decide = useMutation({
    mutationFn: ({ pid, decision, reason }: { pid: string; decision: string; reason?: string }) => api.post(`/admin/products/${pid}/decision`, { decision, reason }),
    onSuccess: (_d, v) => {
      toast({ tone: 'success', title: v.decision === 'APPROVED' ? 'Listing published' : v.decision === 'UNPUBLISHED' ? 'Listing unpublished' : 'Changes requested', description: 'The supplier has been notified.' });
      void invalidate();
    },
    onError: (e) => toast({ tone: 'error', title: errorMessage(e) }),
  });
  if (!cfg) return <Navigate to="/admin/products/pending" replace />;
  return (
    <>
      {element}
      <PageHeader title={cfg.title} description={cfg.description} />
      <SearchBox placeholder="Search by product, supplier or category" />
      {query.isLoading ? (
        <PageLoader />
      ) : query.isError ? (
        <ErrorState message={errorMessage(query.error)} />
      ) : query.data!.products.length === 0 ? (
        <EmptyState icon={<Package className="size-7" />} title={q ? 'No listings match your search.' : cfg.empty} />
      ) : (
        <>
          <ul className="space-y-4">
            {query.data!.products.map((p) => {
              const stock = p.variants.length ? p.variants.reduce<number | null>((sum, v) => (v.stockQuantity == null || sum == null ? null : sum + v.stockQuantity), 0) : p.stockQuantity;
              return (
                <li key={p.id} className="rounded-xl border border-line bg-white p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-serif text-lg font-semibold text-brand-900">{p.title}</span>
                    {p.isFixture && <FixtureBadge />}
                    <StatusBadge status={p.status} className="ml-auto" />
                  </div>
                  <p className="mt-1 text-sm text-muted">
                    <Link to={`/admin/suppliers/${p.supplier.id}`} className="font-medium text-copper-600 hover:underline">
                      {p.supplier.businessName}
                    </Link>{' '}
                    (<SupplierStatus status={p.supplier.status} className="align-middle" />) · {p.category.name} · {formatINR(p.pricePaise)}/{PRICE_UNIT_SHORT[p.priceUnit as keyof typeof PRICE_UNIT_SHORT]} · MOQ {formatNumber(p.moq)} · {p.variants.length} option(s) · stock {stock == null ? 'not tracked' : formatNumber(stock)}
                  </p>
                  {p.rejectionReason && p.status !== 'APPROVED' && <Alert tone="warning" className="mt-3">{p.rejectionReason}</Alert>}
                  <p className="mt-2 line-clamp-3 text-sm">{p.description}</p>
                  {p.images.length > 0 ? (
                    <ul className="mt-3 flex flex-wrap gap-2">
                      {p.images.map((i, idx) => (
                        <li key={i.id} className="w-24 text-[0.625rem] leading-tight text-muted">
                          <a href={i.url} target="_blank" rel="noreferrer">
                            <img src={i.url} alt={`Photo ${idx + 1} of ${p.title}`} className="size-24 rounded-md border border-line object-cover" />
                          </a>
                          {idx === 0 && <span className="font-semibold text-brand-900">Primary · </span>}
                          {titleCase(i.usageRights)}
                          {i.width ? ` · ${i.width}×${i.height}` : ''}
                          {i.attribution ? ` · ${i.attribution}` : ''}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 text-sm text-danger">No photos uploaded.</p>
                  )}
                  <div className="mt-4 flex flex-wrap gap-2">
                    {p.status === 'PENDING_REVIEW' && (
                      <>
                        <Button
                          size="sm"
                          onClick={async () => {
                            if (await confirm({ title: 'Publish this listing?', body: `“${p.title}” will be visible to all retailers.`, confirmLabel: 'Approve & publish' })) decide.mutate({ pid: p.id, decision: 'APPROVED' });
                          }}
                        >
                          Approve & publish
                        </Button>
                        <Button
                          size="sm"
                          variant="subtle"
                          onClick={async () => {
                            const r = await confirm({ title: 'Request changes', confirmLabel: 'Send to supplier', reason: { label: 'What should the supplier change?' } });
                            if (r) decide.mutate({ pid: p.id, decision: 'REJECTED', reason: r.reason });
                          }}
                        >
                          Request changes
                        </Button>
                      </>
                    )}
                    {p.status === 'APPROVED' && (
                      <>
                        <a href={`/products/${p.id}`} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center rounded-md border border-line px-3.5 text-sm font-medium hover:bg-brand-50">
                          View live listing
                        </a>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={async () => {
                            const r = await confirm({ title: 'Unpublish listing', body: 'It disappears from the marketplace immediately and returns to the supplier.', confirmLabel: 'Unpublish', tone: 'danger', reason: { label: 'Reason (shared with the supplier)' } });
                            if (r) decide.mutate({ pid: p.id, decision: 'UNPUBLISHED', reason: r.reason });
                          }}
                        >
                          Unpublish
                        </Button>
                      </>
                    )}
                    <span className="ml-auto self-center text-xs text-muted">
                      {p.status === 'PENDING_REVIEW' && p.submittedAt ? `Submitted ${formatDate(p.submittedAt)}` : `Updated ${formatDate(p.updatedAt)}`}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
          <Pagination className="mt-4" page={query.data!.page} pageSize={query.data!.pageSize} total={query.data!.total} onPage={setPage} />
        </>
      )}
    </>
  );
}

// ─── Categories ──────────────────────────────────────────────────────────
interface AdminCategory {
  id: string;
  path: string;
  name: string;
  description: string;
  depth: number;
  isActive: boolean;
  filterSet: string;
  _count: { products: number };
}

function Categories() {
  const invalidate = useInvalidate();
  const qc = useQueryClient();
  const prompt = usePromptDialog();
  const q = useQuery({ queryKey: ['admin', 'categories'], queryFn: () => api.get<{ categories: AdminCategory[]; filterSets: string[] }>('/admin/categories') });
  const [form, setForm] = useState({ name: '', slug: '', parentPath: '', description: '', filterSet: 'basics' });
  const [filter, setFilter] = useState<'all' | 'missing'>('all');
  const refresh = () => {
    void invalidate();
    void qc.invalidateQueries({ queryKey: ['categories'] });
  };
  const create = useMutation({
    mutationFn: () => api.post('/admin/categories', { ...form, keywords: [] }),
    onSuccess: () => {
      toast({ tone: 'success', title: 'Category created' });
      setForm({ ...form, name: '', slug: '', description: '' });
      refresh();
    },
  });
  const update = useMutation({
    mutationFn: ({ id, ...data }: { id: string; isActive?: boolean; name?: string; description?: string }) => api.patch(`/admin/categories/${id}`, data),
    onSuccess: refresh,
    onError: (e) => toast({ tone: 'error', title: errorMessage(e) }),
  });
  if (q.isLoading) return <PageLoader />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} />;
  const cats = q.data!.categories;
  // Tree order: each category followed by its children.
  const ordered: AdminCategory[] = [];
  const walk = (parent: string | null) =>
    cats
      .filter((c) => (parent ? c.path.startsWith(parent + '/') && c.depth === parent.split('/').length : c.depth === 0))
      .forEach((c) => {
        ordered.push(c);
        walk(c.path);
      });
  walk(null);
  const missing = ordered.filter((c) => !getCategoryImage(c.path));
  const rows = filter === 'missing' ? missing : ordered;
  return (
    <>
      {prompt.element}
      <PageHeader title="Categories" description={`${formatNumber(cats.length)} categories in the database · ${formatNumber(cats.length - missing.length)} with an illustrative photo · ${formatNumber(missing.length)} using the neutral placeholder.`} />
      <Panel title="Add a category or subcategory" className="mb-6">
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          {create.error && <Alert tone="danger" className="sm:col-span-2">{errorMessage(create.error)}</Alert>}
          <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value, slug: e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') })} />
          <Input label="URL slug" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
          <Select label="Parent" value={form.parentPath} onChange={(e) => setForm({ ...form, parentPath: e.target.value })}>
            <option value="">— Top level —</option>
            {ordered
              .filter((c) => c.depth < 2)
              .map((c) => (
                <option key={c.id} value={c.path}>
                  {'— '.repeat(c.depth)}
                  {c.name}
                </option>
              ))}
          </Select>
          <Select label="Filter set" value={form.filterSet} onChange={(e) => setForm({ ...form, filterSet: e.target.value })}>
            {Object.keys(FILTER_SETS).map((f) => (
              <option key={f}>{f}</option>
            ))}
          </Select>
          <Input label="Description" wrapClassName="sm:col-span-2" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <Button type="submit" loading={create.isPending} className="sm:w-fit">
            Create category
          </Button>
        </form>
      </Panel>
      <div className="mb-3 flex flex-wrap gap-2">
        {(['all', 'missing'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={cn('rounded-full border px-3.5 py-1.5 text-sm font-medium', filter === f ? 'border-brand-900 bg-brand-900 text-white' : 'border-line-strong bg-white')}>
            {f === 'all' ? `All (${cats.length})` : `Without a photo (${missing.length})`}
          </button>
        ))}
      </div>
      <div className="relative overflow-x-auto rounded-xl border border-line bg-white">
        <table className="w-full min-w-[52rem] text-sm">
          <thead className="bg-brand-50 text-left text-xs tracking-wide text-muted uppercase">
            <tr>
              {['Photo', 'Category', 'Path', 'Filters', 'Listings', 'Active', ''].map((h) => (
                <th key={h} className="px-4 py-2.5 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((c) => {
              const img = getCategoryImage(c.path);
              return (
                <tr key={c.id} className={cn(!c.isActive && 'opacity-60')}>
                  <td className="px-4 py-2">
                    {img ? (
                      <img src={img.src} alt="" className="size-12 rounded-md object-cover object-top" />
                    ) : (
                      <span className="flex size-12 items-center justify-center rounded-md bg-brand-50 text-muted" title="No illustrative photo — neutral placeholder shown">
                        <ImageOff className="size-5" aria-label="No photo" />
                      </span>
                    )}
                  </td>
                  <td className={cn('px-4 py-2', c.depth === 0 && 'font-semibold')} style={{ paddingLeft: `${1 + c.depth * 1.25}rem` }}>
                    {c.name}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-muted">{c.path}</td>
                  <td className="px-4 py-2 text-xs">{c.filterSet}</td>
                  <td className="px-4 py-2 tabular-nums">{c._count.products}</td>
                  <td className="px-4 py-2">
                    <input type="checkbox" className="size-4 accent-copper-500" checked={c.isActive} onChange={() => update.mutate({ id: c.id, isActive: !c.isActive })} aria-label={`Active: ${c.name}`} />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      className="text-sm font-medium text-copper-600 hover:underline"
                      onClick={async () => {
                        const name = await prompt.ask({ title: `Rename ${c.name}`, label: 'Category name', initial: c.name, confirmLabel: 'Save name' });
                        if (name && name !== c.name) update.mutate({ id: c.id, name });
                      }}
                    >
                      Rename
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ─── Retailers ───────────────────────────────────────────────────────────
function Retailers() {
  const invalidate = useInvalidate();
  const { page, setPage, q } = usePage();
  const { confirm, element } = useConfirmDialog();
  const query = useQuery({
    queryKey: ['admin', 'retailers', page, q],
    queryFn: () =>
      api.get<{ retailers: { id: string; userId: string; businessName: string; businessType: string; city: string; phone: string; gstin: string | null; createdAt: string; user: { email: string; fullName: string; isActive: boolean; lastLoginAt: string | null }; _count: { orders: number } }[]; total: number; page: number; pageSize: number }>(
        `/admin/retailers?page=${page}${q ? `&q=${encodeURIComponent(q)}` : ''}`,
      ),
    placeholderData: keepPreviousData,
  });
  const setActive = useMutation({
    mutationFn: ({ userId, isActive }: { userId: string; isActive: boolean }) => api.post(`/admin/users/${userId}/active`, { isActive }),
    onSuccess: () => {
      toast({ tone: 'success', title: 'Access updated' });
      void invalidate();
    },
  });
  return (
    <>
      {element}
      <PageHeader title="Retailer Management" description={query.data ? `${formatNumber(query.data.total)} registered retailer account(s).` : undefined} />
      <SearchBox placeholder="Search by shop name, contact, email, phone or city" />
      {query.isLoading ? (
        <PageLoader />
      ) : query.data?.retailers.length ? (
        <>
          <div className="relative overflow-x-auto rounded-xl border border-line bg-white">
            <table className="w-full min-w-[56rem] text-sm">
              <thead className="bg-brand-50 text-left text-xs tracking-wide text-muted uppercase">
                <tr>
                  {['Business', 'Contact', 'City', 'GSTIN', 'Orders', 'Joined', 'Last sign-in', 'Access'].map((h) => (
                    <th key={h} className="px-4 py-2.5 font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {query.data.retailers.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-3 font-medium">
                      {r.businessName}
                      <div className="text-xs font-normal text-muted">{titleCase(r.businessType)}</div>
                    </td>
                    <td className="px-4 py-3">
                      {r.user.fullName}
                      <div className="text-xs text-muted">
                        {r.user.email} · {r.phone}
                      </div>
                    </td>
                    <td className="px-4 py-3">{r.city}</td>
                    <td className="px-4 py-3 font-mono text-xs">{r.gstin ?? '—'}</td>
                    <td className="px-4 py-3 tabular-nums">{r._count.orders}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{formatDate(r.createdAt)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{r.user.lastLoginAt ? formatDate(r.user.lastLoginAt) : '—'}</td>
                    <td className="px-4 py-3">
                      <Button
                        size="sm"
                        variant={r.user.isActive ? 'subtle' : 'primary'}
                        onClick={async () => {
                          const ok = await confirm({
                            title: r.user.isActive ? `Deactivate ${r.businessName}?` : `Reactivate ${r.businessName}?`,
                            body: r.user.isActive ? 'They are signed out everywhere and cannot sign in until reactivated. Their orders are kept.' : 'They will be able to sign in again.',
                            confirmLabel: r.user.isActive ? 'Deactivate' : 'Reactivate',
                            tone: r.user.isActive ? 'danger' : 'primary',
                          });
                          if (ok) setActive.mutate({ userId: r.userId, isActive: !r.user.isActive });
                        }}
                      >
                        {r.user.isActive ? 'Deactivate' : 'Reactivate'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination className="mt-4" page={query.data.page} pageSize={query.data.pageSize} total={query.data.total} onPage={setPage} />
        </>
      ) : (
        <EmptyState icon={<Users className="size-7" />} title={q ? 'No retailers match your search.' : 'No retailers have registered yet.'} />
      )}
    </>
  );
}

// ─── Orders & commissions ────────────────────────────────────────────────
function Orders() {
  const invalidate = useInvalidate();
  const q = useQuery({ queryKey: ['admin', 'orders'], queryFn: () => api.get<{ orders: { id: string; orderNumber: string; status: string; subtotalPaise: number; createdAt: string; retailer: { businessName: string; city: string }; supplierOrders: { id: string; status: string; subtotalPaise: number; supplier: { businessName: string }; commission: { rateBps: number; amountPaise: number; status: string } | null; shipments: { id: string; carrier: string; trackingNumber: string }[]; _count: { items: number } }[] }[] }>('/admin/orders') });
  const record = useMutation({ mutationFn: ({ soId, rateBps, status }: { soId: string; rateBps: number; status: string }) => api.post(`/admin/supplier-orders/${soId}/commission`, { rateBps, status }), onSuccess: () => { toast({ tone: 'success', title: 'Commission recorded' }); void invalidate(); }, onError: (e) => toast({ tone: 'error', title: errorMessage(e) }) });
  const prompt = usePromptDialog();
  return (
    <>
      {prompt.element}
      <PageHeader title="Orders & fulfilment" description="Monitor every supplier group and record commissions on confirmed orders." />
      {q.isLoading ? <PageLoader /> : q.data?.orders.length ? (
        <ul className="space-y-4">
          {q.data.orders.map((o) => (
            <li key={o.id} className="rounded-xl border border-line bg-white p-5">
              <div className="flex flex-wrap items-center gap-3"><span className="font-semibold">{o.orderNumber}</span><span className="text-sm text-muted">{o.retailer.businessName} · {o.retailer.city} · {formatDate(o.createdAt)}</span><StatusBadge status={o.status} /><span className="ml-auto font-medium">{formatINR(o.subtotalPaise)}</span></div>
              <ul className="mt-3 divide-y divide-line rounded-lg border border-line text-sm">
                {o.supplierOrders.map((so) => (
                  <li key={so.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                    <span className="font-medium">{so.supplier.businessName}</span>
                    <StatusBadge status={so.status} />
                    <span className="text-muted">{so._count.items} lines · {formatINR(so.subtotalPaise)}</span>
                    {so.shipments[0] && <span className="text-xs text-muted">{so.shipments[0].carrier} {so.shipments[0].trackingNumber}</span>}
                    <span className="ml-auto flex items-center gap-2">
                      {so.commission ? <span className="text-xs">Commission {so.commission.rateBps / 100}% = {formatINR(so.commission.amountPaise)} · {titleCase(so.commission.status)}</span> : null}
                      {['CONFIRMED', 'PROCESSING', 'DISPATCHED', 'DELIVERED'].includes(so.status) && (
                        <Button size="sm" variant="subtle" onClick={async () => { const pct = await prompt.ask({ title: `Commission · ${so.supplier.businessName}`, label: `Commission rate (%) on ${formatINR(so.subtotalPaise)}`, inputMode: 'decimal', initial: so.commission ? String(so.commission.rateBps / 100) : '', confirmLabel: 'Record commission' }); if (pct && !Number.isNaN(Number(pct))) record.mutate({ soId: so.id, rateBps: Math.round(Number(pct) * 100), status: so.commission?.status ?? 'PENDING' }); }}>
                          {so.commission ? 'Edit commission' : 'Record commission'}
                        </Button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      ) : <EmptyState icon={<ShoppingBag className="size-7" />} title="No orders have been placed yet." description="Retailer order requests will appear here." />}
    </>
  );
}

function Commissions() {
  const q = useQuery({ queryKey: ['admin', 'commissions'], queryFn: () => api.get<{ commissions: { id: string; rateBps: number; amountPaise: number; status: string; createdAt: string; supplier: { businessName: string }; supplierOrder: { subtotalPaise: number; order: { orderNumber: string } } }[] }>('/admin/commissions') });
  return (
    <>
      <PageHeader title="Commissions" description="Recorded per supplier order group." />
      {q.isLoading ? <PageLoader /> : q.data?.commissions.length ? (
        <div className="relative overflow-x-auto rounded-xl border border-line bg-white">
          <table className="w-full text-sm">
            <thead className="bg-brand-50 text-left text-xs text-muted"><tr>{['Order', 'Supplier', 'Order value', 'Rate', 'Commission', 'Status', 'Recorded'].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">
              {q.data.commissions.map((c) => (
                <tr key={c.id}><td className="px-4 py-3">{c.supplierOrder.order.orderNumber}</td><td className="px-4 py-3">{c.supplier.businessName}</td><td className="px-4 py-3">{formatINR(c.supplierOrder.subtotalPaise)}</td><td className="px-4 py-3">{c.rateBps / 100}%</td><td className="px-4 py-3 font-medium">{formatINR(c.amountPaise)}</td><td className="px-4 py-3"><StatusBadge status={c.status} /></td><td className="px-4 py-3">{formatDate(c.createdAt)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <EmptyState icon={<BadgeIndianRupee className="size-7" />} title="No commissions recorded" description="Record commissions from the Orders page once a supplier confirms an order." />}
    </>
  );
}

function Complaints() {
  const invalidate = useInvalidate();
  const q = useQuery({ queryKey: ['admin', 'complaints'], queryFn: () => api.get<{ complaints: { id: string; subject: string; description: string; type: string; status: string; resolution: string | null; createdAt: string; retailer: { businessName: string }; order: { orderNumber: string } | null }[] }>('/admin/complaints') });
  const update = useMutation({ mutationFn: ({ id, status, resolution }: { id: string; status: string; resolution?: string }) => api.patch(`/admin/complaints/${id}`, { status, resolution }), onSuccess: () => void invalidate() });
  const prompt = usePromptDialog();
  return (
    <>
      {prompt.element}
      <PageHeader title="Complaints" />
      {q.isLoading ? <PageLoader /> : q.data?.complaints.length ? (
        <ul className="space-y-3">
          {q.data.complaints.map((c) => (
            <li key={c.id} className="rounded-xl border border-line bg-white p-5">
              <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{c.subject}</span><StatusBadge status={c.status} className="ml-auto" /></div>
              <p className="mt-1 text-xs text-muted">{c.retailer.businessName} · {titleCase(c.type)} · {formatDate(c.createdAt)}{c.order ? ` · ${c.order.orderNumber}` : ''}</p>
              <p className="mt-2 text-sm whitespace-pre-line">{c.description}</p>
              {c.resolution && <p className="mt-2 text-sm text-success">Resolution: {c.resolution}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                {c.status === 'OPEN' && <Button size="sm" variant="subtle" onClick={() => update.mutate({ id: c.id, status: 'IN_REVIEW' })}>Start review</Button>}
                {['OPEN', 'IN_REVIEW'].includes(c.status) && (
                  <>
                    <Button size="sm" onClick={async () => { const r = await prompt.ask({ title: 'Resolve complaint', label: 'Resolution details (shared with the retailer)', multiline: true, confirmLabel: 'Mark resolved' }); if (r) update.mutate({ id: c.id, status: 'RESOLVED', resolution: r }); }}>Resolve</Button>
                    <Button size="sm" variant="subtle" onClick={async () => { const r = await prompt.ask({ title: 'Reject complaint', label: 'Reason (shared with the retailer)', multiline: true, confirmLabel: 'Reject complaint' }); if (r) update.mutate({ id: c.id, status: 'REJECTED', resolution: r }); }}>Reject</Button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : <EmptyState icon={<LifeBuoy className="size-7" />} title="No complaints" />}
    </>
  );
}

function Messages() {
  const invalidate = useInvalidate();
  const q = useQuery({ queryKey: ['admin', 'messages'], queryFn: () => api.get<{ messages: { id: string; name: string; email: string; phone: string | null; topic: string; message: string; handled: boolean; createdAt: string }[] }>('/admin/messages') });
  const handle = useMutation({ mutationFn: (id: string) => api.post(`/admin/messages/${id}/handled`), onSuccess: () => void invalidate() });
  return (
    <>
      <PageHeader title="Contact messages" />
      {q.isLoading ? <PageLoader /> : q.data?.messages.length ? (
        <ul className="space-y-3">
          {q.data.messages.map((m) => (
            <li key={m.id} className={cn('rounded-xl border border-line bg-white p-5', m.handled && 'opacity-60')}>
              <div className="flex flex-wrap items-center gap-2 text-sm"><span className="font-semibold">{m.name}</span><a href={`mailto:${m.email}`} className="link">{m.email}</a>{m.phone && <span className="text-muted">{m.phone}</span>}<span className="ml-auto text-xs text-muted">{titleCase(m.topic)} · {formatDate(m.createdAt)}</span></div>
              <p className="mt-2 text-sm whitespace-pre-line">{m.message}</p>
              {!m.handled && <Button size="sm" variant="subtle" className="mt-3" onClick={() => handle.mutate(m.id)}>Mark handled</Button>}
            </li>
          ))}
        </ul>
      ) : <EmptyState icon={<Inbox className="size-7" />} title="No messages" />}
    </>
  );
}

function AuditLog() {
  const [params, setParams] = useSearchParams();
  const action = params.get('action') ?? '';
  const { page, setPage } = usePage();
  const q = useQuery({
    queryKey: ['admin', 'audit', action, page],
    queryFn: () =>
      api.get<{ logs: { id: string; action: string; entityType: string; entityId: string; metadata: Record<string, unknown> | null; createdAt: string; actor: { email: string } | null }[]; total: number; page: number; pageSize: number }>(
        `/admin/audit-logs?page=${page}${action ? `&action=${action}` : ''}`,
      ),
    placeholderData: keepPreviousData,
  });
  const links: Record<string, (id: string) => string> = { Supplier: (id) => `/admin/suppliers/${id}`, Product: () => '/admin/products/live' };
  return (
    <>
      <PageHeader title="Audit Logs" description="Every administrative decision and sensitive action, newest first." />
      <div className="mb-4 flex flex-wrap gap-2">
        {[
          ['', 'All actions'],
          ['supplier.', 'Supplier decisions'],
          ['document.', 'Documents'],
          ['product.', 'Products'],
          ['category.', 'Categories'],
          ['user.', 'Accounts'],
          ['order.', 'Orders'],
        ].map(([v, l]) => (
          <button key={v || 'all'} onClick={() => setParams(v ? { action: v } : {})} className={cn('rounded-full border px-3.5 py-1.5 text-sm font-medium', action === v ? 'border-brand-900 bg-brand-900 text-white' : 'border-line-strong bg-white')}>
            {l}
          </button>
        ))}
      </div>
      {q.isLoading ? (
        <PageLoader />
      ) : !q.data?.logs.length ? (
        <EmptyState title="No audit entries in this view." />
      ) : (
        <>
          <div className="relative overflow-x-auto rounded-xl border border-line bg-white">
            <table className="w-full min-w-[48rem] text-sm">
              <thead className="bg-brand-50 text-left text-xs tracking-wide text-muted uppercase">
                <tr>
                  {['When', 'Actor', 'Action', 'Entity', 'Details'].map((h) => (
                    <th key={h} className="px-4 py-2.5 font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {q.data.logs.map((l) => (
                  <tr key={l.id} className="align-top">
                    <td className="px-4 py-2 whitespace-nowrap">{formatDate(l.createdAt, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</td>
                    <td className="px-4 py-2">{l.actor?.email ?? 'system'}</td>
                    <td className="px-4 py-2 font-mono text-xs">{l.action}</td>
                    <td className="px-4 py-2 text-xs text-muted">
                      {links[l.entityType] ? (
                        <Link to={links[l.entityType](l.entityId)} className="link">
                          {l.entityType} …{l.entityId.slice(-6)}
                        </Link>
                      ) : (
                        `${l.entityType} …${l.entityId.slice(-6)}`
                      )}
                    </td>
                    <td className="max-w-md px-4 py-2 text-xs break-words text-muted">
                      {l.metadata
                        ? Object.entries(l.metadata)
                            .filter(([, v]) => v !== null && v !== '')
                            .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
                            .join(' · ')
                        : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination className="mt-4" page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onPage={setPage} />
        </>
      )}
    </>
  );
}

export default function AdminRoutes() {
  return (
    <AdminLayout>
      <Routes>
        <Route index element={<Overview />} />
        <Route path="applications" element={<SupplierList key="applications" mode="applications" />} />
        <Route path="suppliers" element={<Navigate to="/admin/applications" replace />} />
        <Route path="suppliers/approved" element={<SupplierList key="approved" mode="approved" />} />
        <Route path="suppliers/rejected" element={<SupplierList key="rejected" mode="rejected" />} />
        <Route path="suppliers/:id" element={<SupplierApplication />} />
        <Route path="documents" element={<DocumentsQueue />} />
        <Route path="products" element={<LegacyProductsRedirect />} />
        <Route path="products/:view" element={<Products />} />
        <Route path="categories" element={<Categories />} />
        <Route path="retailers" element={<Retailers />} />
        <Route path="orders" element={<Orders />} />
        <Route path="commissions" element={<Commissions />} />
        <Route path="complaints" element={<Complaints />} />
        <Route path="messages" element={<Messages />} />
        <Route path="notifications" element={<NotificationsView />} />
        <Route path="audit" element={<AuditLog />} />
        <Route path="settings" element={<AccountSettings />} />
        <Route path="*" element={<EmptyState title="Page not found" actions={<Link to="/admin" className="link">Back to overview</Link>} />} />
      </Routes>
    </AdminLayout>
  );
}

/** Old links (e.g. in earlier notifications) used /admin/products?status=… */
function LegacyProductsRedirect() {
  const [params] = useSearchParams();
  const map: Record<string, string> = { PENDING_REVIEW: 'pending', APPROVED: 'live', REJECTED: 'unpublished' };
  return <Navigate to={`/admin/products/${map[params.get('status') ?? ''] ?? 'pending'}`} replace />;
}
