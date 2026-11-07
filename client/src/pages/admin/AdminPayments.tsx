import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Copy, ExternalLink, ImageUp, RefreshCw, Search, Trash2, XCircle } from 'lucide-react';
import { formatINR, PAYMENT_STATUS_LABELS, paymentSettingsSchema } from '@dhaaga/shared';
import { api, errorMessage, toQuery } from '@/lib/api';
import { PAYMENT_TONE, type PaymentSettingsView } from '@/lib/payments';
import { PageHeader, Panel } from '@/components/dashboard/DashboardLayout';
import { Alert, EmptyState, ErrorState, PageLoader, StatusBadge } from '@/components/ui/Feedback';
import { Button } from '@/components/ui/Button';
import { Checkbox, Input, Select, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Overlay';
import { cn, formatDate, titleCase } from '@/lib/utils';
import { toast } from '@/stores/ui';

const Badge = ({ status }: { status: string }) => <StatusBadge status={PAYMENT_TONE[status] ?? status} label={PAYMENT_STATUS_LABELS[status] ?? status} />;
const when = (d: string | null | undefined) => (d ? formatDate(d, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');

interface PaymentRow {
  id: string;
  status: string;
  amountPaise: number;
  refundedPaise: number;
  internalReference: string | null;
  reference: string | null;
  provider: string;
  providerPaymentId: string | null;
  submittedAt: string | null;
  createdAt: string;
  order: { id: string; orderNumber: string; retailer: { businessName: string; city: string } };
}

const TABS: [string, string][] = [
  ['SUBMITTED', 'Pending verification'],
  ['PENDING', 'Awaiting payment'],
  ['PAID', 'Paid'],
  ['REJECTED', 'Rejected'],
  ['FAILED', 'Failed'],
  ['refunds', 'Refunds'],
  ['', 'All'],
];

/** /admin/payments */
export function PaymentsList() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? 'SUBMITTED';
  const [q, setQ] = useState(params.get('q') ?? '');
  const filters = { q: params.get('q'), from: params.get('from'), to: params.get('to'), minRupees: params.get('min'), maxRupees: params.get('max'), provider: params.get('provider'), page: params.get('page') };
  const query = useQuery({
    queryKey: ['admin', 'payments', status, filters],
    queryFn: () =>
      api.get<{ payments: PaymentRow[]; counts: Record<string, number>; total: number; page: number; pageSize: number }>(
        `/admin/payments${toQuery({ ...(status === 'refunds' ? { refunds: 'true' } : status !== 'ALL_' ? { status } : {}), ...filters })}`,
      ),
  });
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    next.delete('page');
    setParams(next, { replace: true });
  };
  const counts = query.data?.counts ?? {};

  return (
    <>
      <PageHeader title="Payments" description="Verify UPI payments against the business bank account. A retailer's UTR or screenshot is a claim — mark a payment paid only after you have found the credit." />
      <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Payment status">
        {TABS.map(([value, label]) => {
          const n = value === 'refunds' ? counts.withRefunds : value ? counts[value] : undefined;
          return (
            <button
              key={value || 'all'}
              role="tab"
              aria-selected={status === (value || 'ALL_')}
              onClick={() => set('status', value || 'ALL_')}
              className={cn('rounded-full border px-3.5 py-1.5 text-sm font-medium', status === (value || 'ALL_') ? 'border-brand-900 bg-brand-900 text-white' : 'border-line bg-white hover:border-line-strong')}
            >
              {label}
              {n !== undefined && <span className="ml-1.5 tabular-nums opacity-75">{n}</span>}
            </button>
          );
        })}
      </div>
      <form
        className="mb-4 grid gap-3 rounded-xl border border-line bg-white p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(5,minmax(0,1fr))]"
        onSubmit={(e) => {
          e.preventDefault();
          set('q', q.trim());
        }}
      >
        <Input label="Search" placeholder="Order no., retailer, UTR, PAY-, pay_ or order_ id" value={q} onChange={(e) => setQ(e.target.value)} leading={<Search className="size-4" />} />
        <Select label="Method" value={params.get('provider') ?? ''} onChange={(e) => set('provider', e.target.value)}>
          <option value="">All methods</option>
          <option value="RAZORPAY">Razorpay (online)</option>
          <option value="MANUAL_UPI">UPI QR (manual)</option>
        </Select>
        <Input label="From" type="date" value={params.get('from') ?? ''} onChange={(e) => set('from', e.target.value)} />
        <Input label="To" type="date" value={params.get('to') ?? ''} onChange={(e) => set('to', e.target.value)} />
        <Input label="Min ₹" type="number" min={0} value={params.get('min') ?? ''} onChange={(e) => set('min', e.target.value)} />
        <Input label="Max ₹" type="number" min={0} value={params.get('max') ?? ''} onChange={(e) => set('max', e.target.value)} />
      </form>
      {query.isLoading ? (
        <PageLoader />
      ) : query.isError ? (
        <ErrorState message={errorMessage(query.error)} />
      ) : !query.data!.payments.length ? (
        <EmptyState title="No payments match" description="Payments appear here when retailers place orders with UPI QR payment." />
      ) : (
        <div className="relative overflow-x-auto rounded-xl border border-line bg-white">
          <table className="w-full min-w-[46rem] text-sm">
            <thead className="bg-brand-50 text-left text-xs text-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">Order</th>
                <th className="px-4 py-2.5 font-medium">Retailer</th>
                <th className="px-4 py-2.5 text-right font-medium">Amount</th>
                <th className="px-4 py-2.5 font-medium">Method · reference</th>
                <th className="px-4 py-2.5 font-medium">Submitted</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {query.data!.payments.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-3 font-medium">{p.order.orderNumber}</td>
                  <td className="px-4 py-3">
                    {p.order.retailer.businessName}
                    <span className="block text-xs text-muted">{p.order.retailer.city}</span>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">
                    {formatINR(p.amountPaise)}
                    {p.refundedPaise > 0 && <span className="block text-xs font-normal text-muted">{formatINR(p.refundedPaise)} refunded</span>}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {p.provider === 'RAZORPAY' ? 'Razorpay' : 'UPI QR'}
                    <span className="block font-mono">{p.providerPaymentId ?? p.reference ?? '—'}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted">{when(p.submittedAt)}</td>
                  <td className="px-4 py-3">
                    <Badge status={p.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link to={`/admin/payments/${p.id}`} className="font-medium text-copper-600 hover:underline">
                      {p.status === 'SUBMITTED' ? 'Verify' : 'View'}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

interface PaymentDetailData {
  id: string;
  status: string;
  method: string;
  provider: string;
  amountPaise: number;
  refundedPaise: number;
  refundDuePaise: number;
  internalReference: string | null;
  reference: string | null;
  receiptUrl: string | null;
  receiptMime: string | null;
  submittedAt: string | null;
  submissionCount: number;
  verifiedAt: string | null;
  verifiedBy: string | null;
  rejectionReason: string | null;
  createdAt: string;
  order: {
    id: string;
    orderNumber: string;
    status: string;
    subtotalPaise: number;
    createdAt: string;
    shippingAddress: { contactName: string; phone: string; city: string; state: string };
    retailer: { businessName: string; businessType: string; gstin: string | null; phone: string; city: string; state: string | null; user: { email: string; fullName: string } };
    supplierOrders: { id: string; status: string; subtotalPaise: number; supplier: { id: string; businessName: string } }[];
  };
  history: { id: string; type: string; fromStatus: string | null; toStatus: string | null; note: string | null; reference: string | null; at: string; actor: { fullName: string; role: string | null } | null }[];
  refunds: { id: string; amountPaise: number; reference: string | null; note: string; recordedBy: string; createdAt: string; supplierOrderId: string | null; status: string; providerRefundId: string | null }[];
  sameReference: { id: string; status: string; orderNumber: string }[];
  gateway: {
    providerPaymentId: string | null;
    method: string | null;
    failureReason: string | null;
    mode: 'test' | 'live' | null;
    orders: { id: string; amountPaise: number; status: string; createdAt: string }[];
    webhooks: { eventId: string; eventType: string; status: string; note: string | null; receivedAt: string }[];
  };
}

type Dialog = null | 'verify' | 'reject' | 'refund' | 'cancel';
const isGateway = (p: { provider: string }) => p.provider === 'RAZORPAY';

/** /admin/payments/:id */
export function PaymentDetail() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin', 'payment', id], queryFn: () => api.get<{ payment: PaymentDetailData }>(`/admin/payments/${id}`) });
  const [dialog, setDialog] = useState<Dialog>(null);
  const [text, setText] = useState('');
  const [reference, setReference] = useState('');
  const [rupees, setRupees] = useState('');
  const [group, setGroup] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    setText('');
    setReference('');
    setRupees('');
    setGroup('');
    setConfirmed(false);
  }, [dialog]);

  const act = useMutation({
    mutationFn: (kind: Exclude<Dialog, null>) => {
      const url = `/admin/payments/${id}/${kind === 'cancel' ? 'cancel-order' : kind === 'refund' ? 'refunds' : kind}`;
      if (kind === 'verify') return api.post(url, { note: text || undefined, reference: reference || undefined });
      if (kind === 'reject' || kind === 'cancel') return api.post(url, { reason: text });
      return api.post(url, { amountPaise: Math.round(Number(rupees) * 100), note: text, reference: reference || undefined, supplierOrderId: group || undefined });
    },
    onSuccess: (_d, kind) => {
      setDialog(null);
      toast({ tone: 'success', title: { verify: 'Payment marked as paid', reject: 'Submission rejected — retailer notified', refund: 'Refund recorded', cancel: 'Order cancelled for non-payment' }[kind] });
      void qc.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: (e) => toast({ tone: 'error', title: 'Not saved', description: errorMessage(e) }),
  });

  const sync = useMutation({
    mutationFn: () => api.post<{ status: string; outcomes: string[] }>(`/admin/payments/${id}/sync`),
    onSuccess: (r) => {
      toast({ tone: 'success', title: 'Checked with Razorpay', description: `Status: ${PAYMENT_STATUS_LABELS[r.status] ?? r.status}` });
      void qc.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: (e) => toast({ tone: 'error', title: 'Could not check with Razorpay', description: errorMessage(e) }),
  });

  if (q.isLoading) return <PageLoader />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} />;
  const p = q.data!.payment;
  const o = p.order;
  const settled = p.status === 'PAID' || p.status === 'PARTIALLY_REFUNDED';
  const open = p.status === 'PENDING' || p.status === 'REJECTED' || p.status === 'FAILED';

  return (
    <>
      <PageHeader
        title={`Payment · ${o.orderNumber}`}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <Badge status={p.status} /> {p.internalReference} · {isGateway(p) ? `Razorpay${p.gateway.method ? ` · ${p.gateway.method.toUpperCase()}` : ''} (verified by Razorpay)` : 'UPI QR (manual verification)'}
            {isGateway(p) && p.gateway.mode === 'test' && <StatusBadge status="PENDING" label="Test mode" />}
          </span>
        }
        actions={
          <Link to="/admin/payments" className="text-sm font-medium text-copper-600 hover:underline">
            ← All payments
          </Link>
        }
      />
      {p.sameReference.length > 0 && (
        <Alert tone="danger" className="mb-4" title="This UTR also appears on another payment">
          {p.sameReference.map((x) => `${x.orderNumber} (${PAYMENT_STATUS_LABELS[x.status] ?? x.status})`).join(', ')}. Check the bank statement carefully before verifying.
        </Alert>
      )}
      {p.refundDuePaise > 0 && (
        <Alert tone="warning" className="mb-4" title={`Refund due: ${formatINR(p.refundDuePaise)}`}>
          One or more supplier groups were rejected or cancelled after payment. Refund the retailer outside the platform, then record the refund here.
        </Alert>
      )}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-5">
          <Panel title="Amount & supplier breakdown">
            <p className="font-serif text-3xl font-semibold tabular-nums">{formatINR(p.amountPaise)}</p>
            {p.refundedPaise > 0 && <p className="text-sm text-muted">{formatINR(p.refundedPaise)} refunded</p>}
            <table className="mt-4 w-full text-sm">
              <tbody className="divide-y divide-line">
                {o.supplierOrders.map((so) => (
                  <tr key={so.id}>
                    <td className="py-2">{so.supplier.businessName}</td>
                    <td className="py-2">
                      <StatusBadge status={so.status} />
                    </td>
                    <td className={cn('py-2 text-right tabular-nums', (so.status === 'REJECTED' || so.status === 'CANCELLED') && 'text-muted line-through')}>{formatINR(so.subtotalPaise)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>

          {(isGateway(p) || p.gateway.orders.length > 0) && (
            <Panel
              title="Razorpay"
              actions={
                p.gateway.orders.length > 0 && (
                  <Button size="sm" variant="subtle" icon={<RefreshCw className="size-4" />} loading={sync.isPending} onClick={() => sync.mutate()}>
                    Sync with Razorpay
                  </Button>
                )
              }
            >
              <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted">Payment id</dt>
                  <dd className="font-mono break-all" data-testid="rz-payment-id">{p.gateway.providerPaymentId ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Method</dt>
                  <dd>{p.gateway.method ? p.gateway.method.toUpperCase() : '—'}</dd>
                </div>
                {p.gateway.failureReason && (
                  <div className="sm:col-span-2">
                    <dt className="text-xs text-muted">Last failure</dt>
                    <dd className="text-danger">{p.gateway.failureReason}</dd>
                  </div>
                )}
              </dl>
              {p.gateway.orders.length > 0 && (
                <>
                  <h3 className="mt-4 mb-1 text-xs font-semibold tracking-wide text-muted uppercase">Checkout attempts</h3>
                  <ul className="divide-y divide-line text-sm">
                    {p.gateway.orders.map((g) => (
                      <li key={g.id} className="flex flex-wrap gap-x-3 py-1.5">
                        <span className="font-mono">{g.id}</span>
                        <span>{formatINR(g.amountPaise)}</span>
                        <span className="text-muted">{g.status}</span>
                        <span className="text-xs text-muted">{when(g.createdAt)}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {p.gateway.webhooks.length > 0 && (
                <>
                  <h3 className="mt-4 mb-1 text-xs font-semibold tracking-wide text-muted uppercase">Webhook deliveries</h3>
                  <ul className="divide-y divide-line text-sm">
                    {p.gateway.webhooks.map((w) => (
                      <li key={w.eventId} className="flex flex-wrap gap-x-3 py-1.5">
                        <span className="font-medium">{w.eventType}</span>
                        <span className="text-muted">{w.status.toLowerCase()}{w.note ? ` · ${w.note}` : ''}</span>
                        <span className="text-xs text-muted">{when(w.receivedAt)}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Panel>
          )}

          <Panel title="Retailer's submission">
            {p.submittedAt || p.reference ? (
              <div className="space-y-3 text-sm">
                <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-muted">UTR / reference</dt>
                    <dd className="font-mono text-base" data-testid="utr">{p.reference ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Submitted</dt>
                    <dd>
                      {when(p.submittedAt)}
                      {p.submissionCount > 1 && <span className="text-muted"> · attempt {p.submissionCount}</span>}
                    </dd>
                  </div>
                </dl>
                {p.receiptUrl ? (
                  p.receiptMime === 'application/pdf' ? (
                    <a href={p.receiptUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-copper-600 hover:underline">
                      Open receipt (PDF) <ExternalLink className="size-3.5" />
                    </a>
                  ) : (
                    <a href={p.receiptUrl} target="_blank" rel="noreferrer" className="block w-fit">
                      <img src={p.receiptUrl} alt="Receipt submitted by the retailer" className="max-h-96 rounded-lg border border-line" />
                    </a>
                  )
                ) : (
                  <p className="text-muted">No screenshot attached.</p>
                )}
                <p className="text-xs text-muted">A screenshot can be edited. Confirm the credit, amount and UTR in the business bank/UPI statement.</p>
              </div>
            ) : (
              <p className="text-sm text-muted">The retailer has not submitted payment details yet.</p>
            )}
          </Panel>

          <Panel title="Payment history">
            <ol className="space-y-3 text-sm">
              {p.history.map((h) => (
                <li key={h.id} className="border-l-2 border-line pl-3">
                  <span className="font-medium">{titleCase(h.type)}</span>
                  {h.toStatus && <span className="text-muted"> → {PAYMENT_STATUS_LABELS[h.toStatus] ?? h.toStatus}</span>}
                  <span className="block text-xs text-muted">
                    {when(h.at)} · {h.actor ? `${h.actor.fullName}${h.actor.role ? ` (${titleCase(h.actor.role)})` : ''}` : 'System'}
                    {h.reference && <> · UTR <span className="font-mono">{h.reference}</span></>}
                  </span>
                  {h.note && <span className="block text-xs">{h.note}</span>}
                </li>
              ))}
            </ol>
          </Panel>

          {p.refunds.length > 0 && (
            <Panel title="Refunds recorded">
              <ul className="divide-y divide-line text-sm">
                {p.refunds.map((r) => (
                  <li key={r.id} className="py-2">
                    <span className="font-semibold">{formatINR(r.amountPaise)}</span> · {when(r.createdAt)} · {r.recordedBy}
                    {r.status !== 'PROCESSED' && <StatusBadge className="ml-2" status={r.status === 'FAILED' ? 'REJECTED' : 'PENDING'} label={r.status === 'FAILED' ? 'Refund failed' : 'Refund pending at Razorpay'} />}
                    {r.reference && <span className="font-mono text-xs"> · {r.reference}</span>}
                    <span className="block text-xs text-muted">{r.note}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>

        <aside className="space-y-4">
          <Panel title="Actions">
            <div className="flex flex-col gap-2">
              {(p.status === 'SUBMITTED' || open) && (
                <Button icon={<CheckCircle2 className="size-4" />} onClick={() => setDialog('verify')}>
                  Verify payment
                </Button>
              )}
              {p.status === 'SUBMITTED' && (
                <Button variant="subtle" icon={<XCircle className="size-4" />} onClick={() => setDialog('reject')}>
                  Reject submission
                </Button>
              )}
              {settled && (
                <Button variant="subtle" onClick={() => setDialog('refund')}>
                  Record refund
                </Button>
              )}
              {open && (
                <Button variant="danger" onClick={() => setDialog('cancel')}>
                  Cancel order (not paid)
                </Button>
              )}
              {!open && !settled && p.status !== 'SUBMITTED' && <p className="text-sm text-muted">No actions available for a {PAYMENT_STATUS_LABELS[p.status]?.toLowerCase()} payment.</p>}
            </div>
            {p.verifiedAt && (
              <p className="mt-3 text-xs text-muted">
                Verified {when(p.verifiedAt)} by {p.verifiedBy}
              </p>
            )}
            {p.rejectionReason && p.status === 'REJECTED' && <p className="mt-3 text-xs text-danger">Rejected: {p.rejectionReason}</p>}
          </Panel>
          <Panel title="Retailer">
            <dl className="space-y-1.5 text-sm">
              <dd className="font-semibold">{o.retailer.businessName}</dd>
              <dd className="text-muted">
                {titleCase(o.retailer.businessType)} · {o.retailer.city}
                {o.retailer.state ? `, ${o.retailer.state}` : ''}
              </dd>
              {o.retailer.gstin && <dd>GSTIN {o.retailer.gstin}</dd>}
              <dd>
                {o.retailer.user.fullName} · {o.retailer.phone}
              </dd>
              <dd className="break-all">{o.retailer.user.email}</dd>
            </dl>
          </Panel>
          <Panel title="Order">
            <p className="text-sm">
              {o.orderNumber} · <StatusBadge status={o.status} />
            </p>
            <p className="mt-1 text-xs text-muted">Placed {when(o.createdAt)}</p>
          </Panel>
        </aside>
      </div>

      <Modal open={dialog === 'verify'} onClose={() => setDialog(null)} title="Verify payment">
        <div className="space-y-4 p-5">
          <Alert tone="warning">
            Mark as paid only after you have found a credit of <strong>{formatINR(p.amountPaise)}</strong>
            {p.reference ? (
              <>
                {' '}
                with UTR <span className="font-mono">{p.reference}</span>
              </>
            ) : null}{' '}
            in the business bank/UPI statement. Suppliers are told they may start fulfilment.
          </Alert>
          {p.status !== 'SUBMITTED' && <Input label="Bank / UPI reference of the credit" value={reference} onChange={(e) => setReference(e.target.value)} required hint="The retailer has not submitted one, so record the reference you found." />}
          <Textarea label="Internal note (optional)" value={text} onChange={(e) => setText(e.target.value)} maxLength={500} />
          <Checkbox label="I have confirmed this credit in the business account" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
          <Button className="w-full" loading={act.isPending} disabled={!confirmed || (p.status !== 'SUBMITTED' && !reference.trim())} onClick={() => act.mutate('verify')}>
            Mark as paid
          </Button>
        </div>
      </Modal>
      <Modal open={dialog === 'reject'} onClose={() => setDialog(null)} title="Reject this submission">
        <div className="space-y-4 p-5">
          <Textarea label="Reason shown to the retailer" value={text} onChange={(e) => setText(e.target.value)} required maxLength={500} placeholder="e.g. No credit with this UTR was found. Please check the 12-digit UPI reference." />
          <Button variant="danger" className="w-full" loading={act.isPending} disabled={text.trim().length < 5} onClick={() => act.mutate('reject')}>
            Reject submission
          </Button>
        </div>
      </Modal>
      <Modal open={dialog === 'refund'} onClose={() => setDialog(null)} title="Record a refund">
        <div className="space-y-4 p-5">
          <p className="text-sm text-muted">
            {isGateway(p) ? 'The refund is issued through Razorpay to the retailer\'s original payment method.' : 'Send the refund from the business bank/UPI account first, then record it here.'} Remaining: {formatINR(p.amountPaise - p.refundedPaise)}.
          </p>
          <Input label="Amount refunded (₹)" type="number" min={0} step="0.01" value={rupees} onChange={(e) => setRupees(e.target.value)} required />
          <Select label="For supplier group (optional)" value={group} onChange={(e) => setGroup(e.target.value)}>
            <option value="">Whole order</option>
            {o.supplierOrders.map((so) => (
              <option key={so.id} value={so.id}>
                {so.supplier.businessName} · {formatINR(so.subtotalPaise)} · {titleCase(so.status)}
              </option>
            ))}
          </Select>
          {!isGateway(p) && <Input label="Refund transaction reference (optional)" value={reference} onChange={(e) => setReference(e.target.value)} />}
          <Textarea label="Note" value={text} onChange={(e) => setText(e.target.value)} required maxLength={500} placeholder="e.g. Supplier rejected the kurti group" />
          <Button className="w-full" loading={act.isPending} disabled={!(Number(rupees) > 0) || text.trim().length < 5} onClick={() => act.mutate('refund')}>
            {isGateway(p) ? 'Refund through Razorpay' : 'Record refund'}
          </Button>
        </div>
      </Modal>
      <Modal open={dialog === 'cancel'} onClose={() => setDialog(null)} title="Cancel order for non-payment">
        <div className="space-y-4 p-5">
          <Alert tone="danger">
            Every supplier group that is not yet in fulfilment is cancelled and its reserved stock is released. The retailer and suppliers are notified.
          </Alert>
          <Textarea label="Reason" value={text} onChange={(e) => setText(e.target.value)} required maxLength={500} />
          <Button variant="danger" className="w-full" loading={act.isPending} disabled={text.trim().length < 5} onClick={() => act.mutate('cancel')}>
            Cancel order
          </Button>
        </div>
      </Modal>
    </>
  );
}

/** /admin/settings/payments */
export function PaymentSettingsPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin', 'payment-settings'], queryFn: () => api.get<{ settings: PaymentSettingsView }>('/admin/payment-settings') });
  const [form, setForm] = useState<Record<string, string | boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const fileInput = useRef<HTMLInputElement>(null);
  const s = q.data?.settings;
  useEffect(() => {
    if (s)
      setForm({
        manualUpiEnabled: s.manualUpiEnabled,
        gatewayEnabled: s.gatewayEnabled,
        upiId: s.upiId ?? '',
        beneficiaryName: s.beneficiaryName ?? '',
        instructions: s.instructions ?? '',
        supportPhone: s.supportPhone ?? '',
        supportEmail: s.supportEmail ?? '',
        paymentTerms: s.paymentTerms ?? '',
        refundPolicy: s.refundPolicy ?? '',
      });
  }, [s]);
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'payment-settings'] });

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.put<{ settings: PaymentSettingsView }>('/admin/payment-settings', body),
    onSuccess: () => {
      toast({ tone: 'success', title: 'Payment settings saved' });
      void refresh();
    },
    onError: (e) => toast({ tone: 'error', title: 'Not saved', description: errorMessage(e) }),
  });
  const upload = useMutation({
    mutationFn: (f: File) => {
      const fd = new FormData();
      fd.append('qr', f, f.name);
      return api.post('/admin/payment-settings/qr', fd);
    },
    onSuccess: () => {
      toast({ tone: 'success', title: 'QR uploaded', description: 'Check the preview and scan it with a UPI app before enabling payments.' });
      void refresh();
    },
    onError: (e) => toast({ tone: 'error', title: 'QR not uploaded', description: errorMessage(e) }),
  });
  const removeQr = useMutation({
    mutationFn: () => api.delete('/admin/payment-settings/qr'),
    onSuccess: () => {
      toast({ tone: 'success', title: 'QR removed', description: 'UPI QR payments are switched off until a new QR is uploaded.' });
      void refresh();
    },
  });

  if (q.isLoading || !s) return <PageLoader />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} />;
  const field = (k: string) => ({ value: String(form[k] ?? ''), onChange: (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value })), error: errors[k] });

  const onSave = () => {
    const r = paymentSettingsSchema.safeParse(form);
    if (!r.success) {
      setErrors(Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrors({});
    save.mutate(r.data);
  };

  return (
    <>
      <PageHeader title="Settings · Payments" description="Business payment details shown to retailers. Only administrators can see or change these settings." />
      {!s.ready && (
        <Alert tone="info" className="mb-5" title="UPI QR payments are off">
          Retailers place orders without online payment until you upload the business UPI QR, enter the beneficiary name and enable UPI QR payments below.
        </Alert>
      )}
      <Panel title="Online payments · Razorpay" className="mb-5">
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-xs text-muted">Server keys</dt>
            <dd data-testid="rz-status">{s.gateway.configured ? <StatusBadge status="APPROVED" label={`Configured · ${s.gateway.mode === 'live' ? 'LIVE' : 'TEST'} mode`} /> : <StatusBadge status="PENDING" label="Not configured" />}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Key id</dt>
            <dd className="font-mono">{s.gateway.keyId ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Webhook secret</dt>
            <dd>{s.gateway.webhookConfigured ? 'Set' : <span className="text-danger">Not set — payments are confirmed only by the checkout callback and manual sync</span>}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Online payments at checkout</dt>
            <dd>{s.gateway.ready ? 'On' : 'Off'}</dd>
          </div>
          <div className="sm:col-span-2 lg:col-span-4">
            <dt className="text-xs text-muted">Webhook URL (add in Razorpay Dashboard → Webhooks)</dt>
            <dd className="flex flex-wrap items-center gap-2">
              <code className="rounded bg-brand-50 px-2 py-1 break-all">{s.gateway.webhookUrl}</code>
              <Button size="sm" variant="subtle" icon={<Copy className="size-3.5" />} onClick={() => void navigator.clipboard?.writeText(s.gateway.webhookUrl)}>
                Copy
              </Button>
            </dd>
            <p className="mt-1 text-xs text-muted">Events: payment.captured, payment.failed, payment.authorized, order.paid, refund.processed, refund.failed. Keys and secrets are set on the server (environment variables), never here.</p>
          </div>
          {s.gateway.problem && <p className="text-danger sm:col-span-2 lg:col-span-4">{s.gateway.problem}</p>}
        </dl>
      </Panel>
      <div className="grid gap-5 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <Panel title="Business UPI QR">
          {s.qrUrl ? (
            <img src={s.qrUrl} alt="Currently configured UPI QR" className="aspect-square w-full rounded-lg border border-line bg-white object-contain p-2" data-testid="qr-preview" />
          ) : (
            <div className="flex aspect-square w-full items-center justify-center rounded-lg border border-dashed border-line-strong bg-ivory-light p-6 text-center text-sm text-muted">No QR uploaded</div>
          )}
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            data-testid="qr-input"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) upload.mutate(f);
            }}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" icon={<ImageUp className="size-4" />} loading={upload.isPending} onClick={() => fileInput.current?.click()}>
              {s.hasQr ? 'Replace QR' : 'Upload QR'}
            </Button>
            {s.hasQr && (
              <Button size="sm" variant="subtle" icon={<Trash2 className="size-4" />} loading={removeQr.isPending} onClick={() => removeQr.mutate()}>
                Remove
              </Button>
            )}
          </div>
          <p className="mt-2 text-xs text-muted">Upload the QR issued by your bank or UPI merchant app for the business account (PNG, JPG or WebP, up to 2 MB). Scan the preview with a UPI app to confirm the payee before enabling.</p>
        </Panel>

        <Panel title="Payment details">
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Beneficiary display name" {...field('beneficiaryName')} hint="Exactly as the UPI app shows the payee" />
              <Input label="UPI ID (optional)" placeholder="business@bank" {...field('upiId')} />
              <Input label="Payment support phone" {...field('supportPhone')} />
              <Input label="Payment support email" type="email" {...field('supportEmail')} />
            </div>
            <Textarea label="Payment instructions" rows={3} {...field('instructions')} />
            <Textarea label="Payment terms" rows={3} {...field('paymentTerms')} />
            <Textarea label="Refund instructions" rows={3} {...field('refundPolicy')} />
            <div className="space-y-2 rounded-lg border border-line bg-ivory-light p-3">
              <Checkbox label="Enable UPI QR payments at checkout" description="Requires the QR and beneficiary name. Admins verify every payment manually." checked={!!form.manualUpiEnabled} onChange={(e) => setForm((f) => ({ ...f, manualUpiEnabled: e.target.checked }))} />
              <Checkbox
                label="Enable online payments (Razorpay)"
                description={s.gatewayAvailable ? `UPI, cards, net banking and wallets through Razorpay${s.gateway.mode === 'test' ? ' — TEST MODE, no real money' : ''}.` : (s.gateway.problem ?? 'Not available: Razorpay keys are not configured on the server.')}
                checked={!!form.gatewayEnabled}
                disabled={!s.gatewayAvailable}
                onChange={(e) => setForm((f) => ({ ...f, gatewayEnabled: e.target.checked }))}
              />
            </div>
            <Button loading={save.isPending} onClick={onSave}>
              Save payment settings
            </Button>
            <p className="text-xs text-muted">Never store bank passwords, UPI PINs or card details here. Last updated {when(s.updatedAt)}.</p>
          </div>
        </Panel>
      </div>
    </>
  );
}
