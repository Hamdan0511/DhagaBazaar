import { useState } from 'react';
import { Link, Route, Routes, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Bell,
  Bookmark,
  Building2,
  CircleHelp,
  ExternalLink,
  Heart,
  LayoutDashboard,
  LifeBuoy,
  MapPin,
  MessagesSquare,
  Package,
  Printer,
  Search,
  Settings,
  ShoppingBag,
  ShoppingCart,
  Store,
  Truck,
  TriangleAlert,
} from 'lucide-react';
import { isSafeHttpUrl, changePasswordSchema, complaintSchema, formatINR, formatNumber, INDIAN_STATES, retailerProfileSchema, PRICE_UNIT_SHORT, type RetailerProfileInput } from '@dhaaga/shared';
import { api, errorMessage } from '@/lib/api';
import type { Address, Order, ProductCardData } from '@/lib/types';
import { DashboardLayout, NotificationsView, PageHeader, Panel, StatCard, useUnreadCount, type NavItem } from '@/components/dashboard/DashboardLayout';
import { Alert, EmptyState, ErrorState, PageLoader, StatusBadge } from '@/components/ui/Feedback';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Field';
import { ProductCard } from '@/components/catalog/ProductCard';
import { AddressForm } from '@/components/dashboard/AddressForm';
import { AccountSettings } from '@/components/dashboard/AccountSettings';
import { useAuth } from '@/hooks/useAuth';
import { cn, formatDate, titleCase } from '@/lib/utils';
import { toast } from '@/stores/ui';

// ─── Overview ────────────────────────────────────────────────────────────
function Overview() {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ['retailer', 'overview'],
    queryFn: () => api.get<{ counts: Record<string, number>; recentOrders: { id: string; orderNumber: string; status: string; subtotalPaise: number; createdAt: string; _count: { supplierOrders: number } }[] }>('/retailer/overview'),
  });
  if (q.isLoading) return <PageLoader />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  const { counts, recentOrders } = q.data!;
  return (
    <>
      <PageHeader title={`Welcome, ${user?.fullName.split(' ')[0]}`} description={user?.retailer?.businessName} actions={<ButtonLink to="/categories">Browse catalogue</ButtonLink>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Orders" value={counts.orders} to="/account/orders" icon={Package} />
        <StatCard label="Open enquiries" value={counts.openEnquiries} to="/account/enquiries" icon={MessagesSquare} />
        <StatCard label="Cart items" value={counts.cartItems} to="/cart" icon={ShoppingCart} />
        <StatCard label="Saved products" value={counts.savedProducts} to="/account/saved" icon={Heart} />
      </div>
      <Panel title="Recent orders" className="mt-6" actions={recentOrders.length > 0 && <Link to="/account/orders" className="link text-sm">View all</Link>}>
        {recentOrders.length === 0 ? (
          <EmptyState className="border-0 bg-transparent py-6" icon={<Package className="size-7" />} title="No orders have been placed yet." description="Your bulk order requests will appear here once you submit them." actions={<ButtonLink to="/categories" variant="subtle">Start exploring</ButtonLink>} />
        ) : (
          <ul className="divide-y divide-line">
            {recentOrders.map((o) => (
              <li key={o.id}>
                <Link to={`/account/orders/${o.id}`} className="flex flex-wrap items-center gap-3 py-3 text-sm hover:text-copper-600">
                  <span className="font-semibold">{o.orderNumber}</span>
                  <span className="text-muted">{formatDate(o.createdAt)}</span>
                  <span className="text-muted">{o._count.supplierOrders} supplier{o._count.supplierOrders === 1 ? '' : 's'}</span>
                  <StatusBadge status={o.status} />
                  <span className="ml-auto font-medium">{formatINR(o.subtotalPaise)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}

// ─── Orders ──────────────────────────────────────────────────────────────
function useOrders() {
  return useQuery({ queryKey: ['retailer', 'orders'], queryFn: () => api.get<{ orders: Order[] }>('/retailer/orders') });
}

function Orders() {
  const q = useOrders();
  return (
    <>
      <PageHeader title="My Orders" description="Each order is split into supplier groups, fulfilled independently." />
      {q.isLoading ? (
        <PageLoader />
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} />
      ) : q.data!.orders.length === 0 ? (
        <EmptyState icon={<Package className="size-7" />} title="No orders have been placed yet." description="Add products to your cart and submit a bulk order request to get started." actions={<ButtonLink to="/categories">Explore collections</ButtonLink>} />
      ) : (
        <ul className="space-y-3">
          {q.data!.orders.map((o) => (
            <li key={o.id}>
              <Link to={`/account/orders/${o.id}`} className="block rounded-xl border border-line bg-white p-4 transition-shadow hover:shadow-[var(--shadow-card)]">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-semibold">{o.orderNumber}</span>
                  <StatusBadge status={o.status} />
                  <span className="ml-auto font-semibold">{formatINR(o.subtotalPaise)}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted">
                  <span>{formatDate(o.createdAt)}</span>
                  {o.supplierOrders.map((so) => (
                    <span key={so.id} className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5">
                      {so.supplier.businessName} · {titleCase(so.status)}
                    </span>
                  ))}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

const STEPS = ['REQUESTED', 'CONFIRMED', 'DISPATCHED', 'DELIVERED'];

function OrderDetail() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const [params] = useSearchParams();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['retailer', 'order', id], queryFn: () => api.get<{ order: Order }>(`/retailer/orders/${id}`) });
  const cancel = useMutation({
    mutationFn: (soId: string) => api.post(`/retailer/orders/${id}/supplier-orders/${soId}/cancel`),
    onSuccess: () => {
      toast({ tone: 'success', title: 'Request cancelled' });
      void qc.invalidateQueries({ queryKey: ['retailer'] });
    },
    onError: (e) => toast({ tone: 'error', title: 'Could not cancel', description: errorMessage(e) }),
  });
  if (q.isLoading) return <PageLoader />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} />;
  const o = q.data!.order;
  const a = o.shippingAddress;
  return (
    <>
      <PageHeader
        title={`Order ${o.orderNumber}`}
        description={`Submitted ${formatDate(o.createdAt, { day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' })}`}
        actions={
          <>
            <Button variant="subtle" size="sm" icon={<Printer className="size-4" />} onClick={() => window.print()}>
              Print / save quotation (PDF)
            </Button>
            <ButtonLink to={`/account/complaints?order=${o.id}`} variant="subtle" size="sm" icon={<TriangleAlert className="size-4" />}>
              Report an issue
            </ButtonLink>
          </>
        }
      />
      {/* Print-only letterhead for the quotation / order request document. */}
      <div className="mb-6 hidden border-b border-line pb-4 print:flex print:items-end print:justify-between">
        <img src="/brand/logo.png" alt="Dhaaga Bazaar" className="h-14 w-auto" />
        <div className="text-right text-xs text-muted">
          <div className="font-serif text-base font-semibold text-brand-900">Bulk order request · {o.orderNumber}</div>
          Printed {formatDate(new Date(), { day: 'numeric', month: 'long', year: 'numeric' })} · {user?.retailer?.businessName}
          <div>Prices as recorded at submission. Final invoice, taxes and shipping are issued by each supplier.</div>
        </div>
      </div>
      {params.get('placed') && (
        <Alert tone="success" className="mb-5" title="Your bulk order request has been submitted">
          Each supplier below has been notified and will confirm their part of the order. You&apos;ll get a notification as they respond.
        </Alert>
      )}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="space-y-5">
          {o.supplierOrders.map((so) => {
            const stepIndex = STEPS.indexOf(so.status === 'PROCESSING' ? 'CONFIRMED' : so.status);
            const ended = ['REJECTED', 'CANCELLED'].includes(so.status);
            return (
              <section key={so.id} className="overflow-hidden rounded-xl border border-line bg-white">
                <header className="flex flex-wrap items-center gap-3 border-b border-line bg-brand-50 px-5 py-3">
                  <Store className="size-4 text-muted" aria-hidden />
                  <span className="font-semibold">{so.supplier.businessName}</span>
                  <StatusBadge status={so.status} />
                  <span className="ml-auto text-sm font-medium">{formatINR(so.subtotalPaise)}</span>
                </header>
                <div className="p-5">
                  {!ended && (
                    <ol className="mb-5 grid grid-cols-4 gap-1 text-center text-[0.6875rem] font-medium sm:text-xs" aria-label="Order progress">
                      {STEPS.map((s, i) => (
                        <li key={s}>
                          <div className={cn('h-1.5 rounded-full', i <= stepIndex ? 'bg-copper-500' : 'bg-brand-100')} />
                          <span className={cn('mt-1.5 block', i <= stepIndex ? 'text-copper-700' : 'text-muted')}>{titleCase(s)}</span>
                        </li>
                      ))}
                    </ol>
                  )}
                  {so.supplierNote && <Alert tone="info" className="mb-4" title="Note from supplier">{so.supplierNote}</Alert>}
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs text-muted">
                      <tr>
                        <th className="pb-2 font-medium">Item</th>
                        <th className="pb-2 text-right font-medium">Qty</th>
                        <th className="pb-2 text-right font-medium">Unit price</th>
                        <th className="pb-2 text-right font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {so.items.map((it) => (
                        <tr key={it.id}>
                          <td className="py-2 pr-2">
                            {it.productId ? <Link to={`/products/${it.productId}`} className="hover:text-copper-600">{it.productTitle}</Link> : it.productTitle}
                            {it.variantLabel && <span className="block text-xs text-muted">{it.variantLabel}</span>}
                          </td>
                          <td className="py-2 text-right tabular-nums">{formatNumber(it.quantity)}</td>
                          <td className="py-2 text-right tabular-nums">{formatINR(it.unitPricePaise)}<span className="text-xs text-muted">/{PRICE_UNIT_SHORT[it.priceUnit]}</span></td>
                          <td className="py-2 text-right font-medium tabular-nums">{formatINR(it.lineTotalPaise)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {so.shipments.length > 0 && (
                    <div className="mt-4 rounded-lg bg-info-bg p-3 text-sm text-info">
                      {so.shipments.map((s) => (
                        <div key={s.id} className="flex flex-wrap items-center gap-2">
                          <Truck className="size-4" aria-hidden /> {s.carrier} · <span className="font-mono">{s.trackingNumber}</span> · {titleCase(s.status)} · {formatDate(s.dispatchedAt)}
                          {isSafeHttpUrl(s.trackingUrl) && (
                            <a href={s.trackingUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 font-medium underline">
                              Track <ExternalLink className="size-3" />
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="mt-4 flex flex-wrap gap-3 text-sm">
                    {so.status === 'REQUESTED' && (
                      <Button variant="subtle" size="sm" loading={cancel.isPending && cancel.variables === so.id} onClick={() => cancel.mutate(so.id)}>
                        Cancel this request
                      </Button>
                    )}
                    {so.supplier.whatsapp && ['CONFIRMED', 'PROCESSING', 'DISPATCHED'].includes(so.status) && (
                      <a href={`https://wa.me/91${so.supplier.whatsapp.replace(/\D/g, '').slice(-10)}?text=${encodeURIComponent(`Hello, regarding Dhaaga Bazaar order ${o.orderNumber}`)}`} target="_blank" rel="noreferrer noopener" className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line px-3 font-medium hover:bg-brand-50">
                        Message supplier on WhatsApp
                      </a>
                    )}
                  </div>
                </div>
              </section>
            );
          })}
        </div>
        <aside className="space-y-4">
          <Panel title="Delivery address">
            <p className="text-sm leading-relaxed">
              <span className="font-medium">{a.label}</span>
              <br />
              {a.contactName} · {a.phone}
              <br />
              {a.line1}
              {a.line2 ? `, ${a.line2}` : ''}
              <br />
              {a.city}, {a.state} {a.pincode}
            </p>
          </Panel>
          {o.notes && (
            <Panel title="Your notes">
              <p className="text-sm whitespace-pre-line">{o.notes}</p>
            </Panel>
          )}
          <Panel title="Summary">
            <div className="flex justify-between text-sm font-semibold">
              <span>Subtotal</span>
              <span>{formatINR(o.subtotalPaise)}</span>
            </div>
            <p className="mt-2 text-xs text-muted">Payment terms, taxes and shipping are agreed with each supplier on confirmation.</p>
          </Panel>
        </aside>
      </div>
    </>
  );
}

function Shipments() {
  const q = useOrders();
  const rows = (q.data?.orders ?? []).flatMap((o) => o.supplierOrders.flatMap((so) => so.shipments.map((s) => ({ ...s, order: o, supplier: so.supplier.businessName }))));
  return (
    <>
      <PageHeader title="Shipment Tracking" description="Dispatch details shared by your suppliers." />
      {q.isLoading ? (
        <PageLoader />
      ) : rows.length === 0 ? (
        <EmptyState icon={<Truck className="size-7" />} title="No shipments yet" description="When a supplier dispatches your order, its courier and tracking number appear here." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-white">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="bg-brand-50 text-left text-xs text-muted">
              <tr>
                {['Order', 'Supplier', 'Carrier', 'Tracking no.', 'Status', 'Dispatched'].map((h) => (
                  <th key={h} className="px-4 py-2.5 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-3"><Link to={`/account/orders/${s.order.id}`} className="link">{s.order.orderNumber}</Link></td>
                  <td className="px-4 py-3">{s.supplier}</td>
                  <td className="px-4 py-3">{s.carrier}</td>
                  <td className="px-4 py-3 font-mono">
                    {isSafeHttpUrl(s.trackingUrl) ? <a href={s.trackingUrl} target="_blank" rel="noreferrer noopener" className="link">{s.trackingNumber}</a> : s.trackingNumber}
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                  <td className="px-4 py-3">{formatDate(s.dispatchedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ─── Enquiries ───────────────────────────────────────────────────────────
function Enquiries() {
  const q = useQuery({
    queryKey: ['retailer', 'enquiries'],
    queryFn: () => api.get<{ enquiries: { id: string; message: string; quantity: number | null; status: string; supplierResponse: string | null; createdAt: string; respondedAt: string | null; supplier: { id: string; businessName: string }; product: { id: string; title: string } | null }[] }>('/retailer/enquiries'),
  });
  return (
    <>
      <PageHeader title="My Enquiries" description="Questions you've sent to suppliers and their replies." />
      {q.isLoading ? (
        <PageLoader />
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} />
      ) : q.data!.enquiries.length === 0 ? (
        <EmptyState icon={<MessagesSquare className="size-7" />} title="Your bulk enquiries will appear here." description="Open any product listing and choose “Send Enquiry” to ask a supplier about pricing, customisation or availability." actions={<ButtonLink to="/categories" variant="subtle">Browse listings</ButtonLink>} />
      ) : (
        <ul className="space-y-3">
          {q.data!.enquiries.map((e) => (
            <li key={e.id} className="rounded-xl border border-line bg-white p-5">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Link to={`/suppliers/${e.supplier.id}`} className="font-semibold hover:text-copper-600">{e.supplier.businessName}</Link>
                {e.product && <span className="text-muted">· <Link to={`/products/${e.product.id}`} className="hover:underline">{e.product.title}</Link></span>}
                <StatusBadge status={e.status} className="ml-auto" />
              </div>
              <p className="mt-2 text-sm whitespace-pre-line">{e.message}</p>
              <p className="mt-1 text-xs text-muted">
                {formatDate(e.createdAt)}
                {e.quantity ? ` · ${formatNumber(e.quantity)} pcs` : ''}
              </p>
              {e.supplierResponse && (
                <div className="mt-3 rounded-lg border-l-2 border-copper-500 bg-brand-50 p-3 text-sm">
                  <div className="text-xs font-semibold text-copper-700">Supplier reply · {e.respondedAt && formatDate(e.respondedAt)}</div>
                  <p className="mt-1 whitespace-pre-line">{e.supplierResponse}</p>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

// ─── Saved ───────────────────────────────────────────────────────────────
function Saved({ tab }: { tab: 'products' | 'suppliers' }) {
  const q = useQuery({
    queryKey: ['saved', 'list'],
    queryFn: () => api.get<{ products: ProductCardData[]; suppliers: { id: string; businessName: string; city: string | null; businessType: string; isVerified: boolean }[] }>('/retailer/saved'),
  });
  return (
    <>
      <PageHeader title={tab === 'products' ? 'Saved Products' : 'Saved Suppliers'} />
      {q.isLoading ? (
        <PageLoader />
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} />
      ) : tab === 'products' ? (
        q.data!.products.length === 0 ? (
          <EmptyState icon={<Heart className="size-7" />} title="No saved products yet" description="Tap the heart on any listing to build a shortlist for later." actions={<ButtonLink to="/categories" variant="subtle">Browse listings</ButtonLink>} />
        ) : (
          <ul className="grid grid-cols-2 gap-4 md:grid-cols-3">
            {q.data!.products.map((p) => (
              <li key={p.id}><ProductCard product={p} /></li>
            ))}
          </ul>
        )
      ) : q.data!.suppliers.length === 0 ? (
        <EmptyState icon={<Bookmark className="size-7" />} title="No saved suppliers yet" description="Shortlist suppliers from their profile pages to find them quickly." actions={<ButtonLink to="/suppliers" variant="subtle">Supplier directory</ButtonLink>} />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {q.data!.suppliers.map((s) => (
            <li key={s.id}>
              <Link to={`/suppliers/${s.id}`} className="block rounded-xl border border-line bg-white p-4 hover:shadow-[var(--shadow-card)]">
                <div className="font-semibold">{s.businessName}</div>
                <div className="text-sm text-muted">{titleCase(s.businessType)}{s.city ? ` · ${s.city}` : ''}</div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

// ─── Complaints ──────────────────────────────────────────────────────────
function Complaints() {
  const [params] = useSearchParams();
  const qc = useQueryClient();
  const orders = useOrders();
  const q = useQuery({ queryKey: ['retailer', 'complaints'], queryFn: () => api.get<{ complaints: { id: string; subject: string; description: string; type: string; status: string; resolution: string | null; createdAt: string; order: { orderNumber: string } | null }[] }>('/retailer/complaints') });
  const [open, setOpen] = useState(!!params.get('order'));
  const form = useForm<z.input<typeof complaintSchema>>({ resolver: zodResolver(complaintSchema), defaultValues: { type: 'QUALITY', orderId: params.get('order') ?? undefined } });
  const create = useMutation({
    mutationFn: (v: z.input<typeof complaintSchema>) => api.post('/retailer/complaints', { ...v, orderId: v.orderId || undefined }),
    onSuccess: () => {
      toast({ tone: 'success', title: 'Complaint submitted', description: 'Our team will review it with the supplier.' });
      form.reset({ type: 'QUALITY' });
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ['retailer', 'complaints'] });
    },
  });
  const e = form.formState.errors;
  return (
    <>
      <PageHeader title="Complaints & Returns" description="Report damaged, short, wrong or delayed deliveries." actions={!open && <Button onClick={() => setOpen(true)}>Raise a complaint</Button>} />
      {open && (
        <Panel title="New complaint" className="mb-6">
          <form className="space-y-4" onSubmit={form.handleSubmit((v) => create.mutate(v))} noValidate>
            {create.error && <Alert tone="danger">{errorMessage(create.error)}</Alert>}
            <div className="grid gap-4 sm:grid-cols-2">
              <Select label="Related order" {...form.register('orderId')}>
                <option value="">Not order-specific</option>
                {orders.data?.orders.map((o) => (
                  <option key={o.id} value={o.id}>{o.orderNumber}</option>
                ))}
              </Select>
              <Select label="Issue type" {...form.register('type')}>
                {['QUALITY', 'DELIVERY', 'WRONG_ITEM', 'PAYMENT', 'OTHER'].map((t) => (
                  <option key={t} value={t}>{titleCase(t)}</option>
                ))}
              </Select>
            </div>
            <Input label="Subject" required error={e.subject?.message} {...form.register('subject')} />
            <Textarea label="Describe the issue" required error={e.description?.message} {...form.register('description')} />
            <div className="flex gap-2">
              <Button type="submit" loading={create.isPending}>Submit complaint</Button>
              <Button variant="subtle" onClick={() => setOpen(false)}>Cancel</Button>
            </div>
          </form>
        </Panel>
      )}
      {q.isLoading ? (
        <PageLoader />
      ) : q.data?.complaints.length ? (
        <ul className="space-y-3">
          {q.data.complaints.map((c) => (
            <li key={c.id} className="rounded-xl border border-line bg-white p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{c.subject}</span>
                <StatusBadge status={c.status} className="ml-auto" />
              </div>
              <p className="mt-1 text-xs text-muted">{titleCase(c.type)} · {formatDate(c.createdAt)}{c.order ? ` · ${c.order.orderNumber}` : ''}</p>
              <p className="mt-2 text-sm whitespace-pre-line">{c.description}</p>
              {c.resolution && <Alert tone="success" className="mt-3" title="Resolution">{c.resolution}</Alert>}
            </li>
          ))}
        </ul>
      ) : (
        !open && <EmptyState icon={<LifeBuoy className="size-7" />} title="No complaints" description="If something goes wrong with a delivery, raise it here and we'll coordinate with the supplier." />
      )}
    </>
  );
}

// ─── Business profile ────────────────────────────────────────────────────
function useRetailerProfile() {
  return useQuery({ queryKey: ['retailer', 'profile'], queryFn: () => api.get<{ profile: RetailerProfileInput & { addresses: Address[]; gstin: string | null; state: string | null } }>('/retailer/profile') });
}

function Profile() {
  const q = useRetailerProfile();
  if (q.isLoading) return <PageLoader />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} />;
  const p = q.data!.profile;
  return (
    <>
      <PageHeader title="Business Profile" description="Details suppliers see when you send orders and enquiries." />
      <ProfileForm initial={{ businessName: p.businessName, businessType: p.businessType, gstin: p.gstin ?? '', city: p.city, state: (p.state ?? undefined) as RetailerProfileInput['state'], phone: p.phone }} />
      <Panel title="Delivery addresses" className="mt-6">
        <p className="text-sm text-muted">
          {p.addresses.length ? `${p.addresses.length} saved ${p.addresses.length === 1 ? 'address' : 'addresses'}.` : 'No addresses yet.'}{' '}
          <Link to="/account/addresses" className="link">
            Manage addresses
          </Link>
        </p>
      </Panel>
    </>
  );
}

// ─── Address management ──────────────────────────────────────────────────
function Addresses() {
  const qc = useQueryClient();
  const q = useRetailerProfile();
  const [editing, setEditing] = useState<Address | 'new' | null>(null);
  const del = useMutation({ mutationFn: (id: string) => api.delete(`/retailer/addresses/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['retailer', 'profile'] }) });
  if (q.isLoading) return <PageLoader />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} />;
  const p = q.data!.profile;
  return (
    <>
      <PageHeader title="Addresses" description="Shop and warehouse addresses suppliers deliver to. Your default address is pre-selected at checkout." />
      <Panel title="Business addresses" actions={!editing && <Button size="sm" variant="subtle" onClick={() => setEditing('new')}>Add address</Button>}>
        {editing ? (
          <AddressForm address={editing === 'new' ? undefined : editing} onDone={() => setEditing(null)} onCancel={() => setEditing(null)} />
        ) : p.addresses.length === 0 ? (
          <p className="text-sm text-muted">No addresses yet. Add your shop or warehouse address for deliveries.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {p.addresses.map((a) => (
              <li key={a.id} className="rounded-lg border border-line p-4 text-sm">
                <div className="font-semibold">
                  {a.label} {a.isDefault && <span className="ml-1 rounded bg-brand-100 px-1.5 text-xs font-normal">Default</span>}
                </div>
                <p className="mt-1 text-muted">
                  {a.contactName} · {a.phone}<br />
                  {a.line1}{a.line2 ? `, ${a.line2}` : ''}, {a.city}, {a.state} {a.pincode}
                </p>
                <div className="mt-2 flex gap-3">
                  <button onClick={() => setEditing(a)} className="link text-sm">Edit</button>
                  <button onClick={() => del.mutate(a.id)} className="text-sm text-muted hover:text-danger">Delete</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}

function ProfileForm({ initial }: { initial: RetailerProfileInput }) {
  const qc = useQueryClient();
  const form = useForm<RetailerProfileInput>({ resolver: zodResolver(retailerProfileSchema), defaultValues: initial });
  const save = useMutation({
    mutationFn: (v: RetailerProfileInput) => api.put('/retailer/profile', v),
    onSuccess: () => {
      toast({ tone: 'success', title: 'Profile saved' });
      void qc.invalidateQueries({ queryKey: ['retailer', 'profile'] });
      void qc.invalidateQueries({ queryKey: ['auth'] });
    },
  });
  const e = form.formState.errors;
  return (
    <Panel title="Business details">
      <form className="space-y-4" onSubmit={form.handleSubmit((v) => save.mutate(v))} noValidate>
        {save.error && <Alert tone="danger">{errorMessage(save.error)}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Business name" required error={e.businessName?.message} {...form.register('businessName')} />
          <Select label="Business type" {...form.register('businessType')}>
            <option value="RETAILER">Retailer</option>
            <option value="BOUTIQUE_OWNER">Boutique Owner</option>
            <option value="RESELLER">Reseller</option>
          </Select>
          <Input label="GSTIN (optional)" error={e.gstin?.message} {...form.register('gstin')} />
          <Input label="Business phone" required error={e.phone?.message} {...form.register('phone')} />
          <Input label="City" required error={e.city?.message} {...form.register('city')} />
          <Select label="State" {...form.register('state')}>
            <option value="">Select state</option>
            {INDIAN_STATES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </div>
        <Button type="submit" loading={save.isPending}>Save changes</Button>
      </form>
    </Panel>
  );
}

// ─── Settings ────────────────────────────────────────────────────────────
function Help() {
  return (
    <>
      <PageHeader title="Help & Support" />
      <div className="grid gap-4 sm:grid-cols-2">
        {[
          ['Help Centre', 'Answers to common questions about ordering and MOQ.', '/help'],
          ['How ordering works', 'From cart to supplier confirmation and dispatch.', '/how-it-works'],
          ['Contact our team', 'Send us a message about an order or your account.', '/contact'],
          ['Complaints & Returns', 'Report a problem with a delivery.', '/account/complaints'],
        ].map(([t, d, to]) => (
          <Link key={to} to={to} className="rounded-xl border border-line bg-white p-5 hover:shadow-[var(--shadow-card)]">
            <div className="font-serif text-lg font-semibold">{t}</div>
            <p className="mt-1 text-sm text-muted">{d}</p>
          </Link>
        ))}
      </div>
    </>
  );
}

export default function AccountRoutes() {
  const { user } = useAuth();
  const unread = useUnreadCount();
  const nav: NavItem[] = [
    { to: '/account', label: 'Overview', icon: LayoutDashboard, end: true },
    { to: '/search', label: 'Browse Products', icon: Search },
    { to: '/categories', label: 'Categories', icon: ShoppingBag },
    { to: '/cart', label: 'My Cart', icon: ShoppingCart },
    { to: '/account/enquiries', label: 'My Enquiries', icon: MessagesSquare },
    { to: '/account/orders', label: 'My Orders', icon: Package },
    { to: '/account/shipments', label: 'Order Tracking', icon: Truck },
    { to: '/account/saved', label: 'Saved Products', icon: Heart },
    { to: '/account/saved-suppliers', label: 'Saved Suppliers', icon: Bookmark },
    { to: '/account/complaints', label: 'Complaints & Returns', icon: TriangleAlert },
    { to: '/account/notifications', label: 'Notifications', icon: Bell, badge: unread.data },
    { to: '/account/profile', label: 'Business Profile', icon: Building2 },
    { to: '/account/addresses', label: 'Addresses', icon: MapPin },
    { to: '/account/settings', label: 'Account Settings', icon: Settings },
    { to: '/account/help', label: 'Help & Support', icon: CircleHelp },
  ];
  return (
    <DashboardLayout title="My Account" subtitle={user?.retailer?.businessName} nav={nav}>
      <Routes>
        <Route index element={<Overview />} />
        <Route path="orders" element={<Orders />} />
        <Route path="orders/:id" element={<OrderDetail />} />
        <Route path="shipments" element={<Shipments />} />
        <Route path="enquiries" element={<Enquiries />} />
        <Route path="saved" element={<Saved tab="products" />} />
        <Route path="saved-suppliers" element={<Saved tab="suppliers" />} />
        <Route path="complaints" element={<Complaints />} />
        <Route path="notifications" element={<NotificationsView />} />
        <Route path="profile" element={<Profile />} />
        <Route path="addresses" element={<Addresses />} />
        <Route path="settings" element={<AccountSettings />} />
        <Route path="help" element={<Help />} />
        <Route path="*" element={<EmptyState title="Page not found" actions={<ButtonLink to="/account">Back to overview</ButtonLink>} />} />
      </Routes>
    </DashboardLayout>
  );
}
