import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Clock, Copy, CreditCard, FileUp, LifeBuoy, Loader2, Lock, QrCode, ShieldCheck, Smartphone, X } from 'lucide-react';
import { formatINR, PAYMENT_STATUS_LABELS, paymentReferenceSchema } from '@dhaaga/shared';
import { api, errorMessage } from '@/lib/api';
import { PAYMENT_TONE, type RetailerPayment, type RetailerPaymentResponse } from '@/lib/payments';
import { openRazorpayCheckout, type CheckoutOptions } from '@/lib/razorpay';
import { PageHeader, Panel } from '@/components/dashboard/DashboardLayout';
import { Alert, ErrorState, PageLoader, StatusBadge } from '@/components/ui/Feedback';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { formatDate } from '@/lib/utils';
import { toast } from '@/stores/ui';

const RECEIPT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

export function PaymentBadge({ payment }: { payment: Pick<RetailerPayment, 'status'> }) {
  return <StatusBadge status={PAYMENT_TONE[payment.status] ?? payment.status} label={PAYMENT_STATUS_LABELS[payment.status] ?? payment.status} />;
}

/** /account/orders/:id/pay — scan the business UPI QR, then submit the UTR for verification. */
export default function PaymentPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [reference, setReference] = useState('');
  const [refError, setRefError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<File | null>(null);
  // While a Razorpay payment is being confirmed, re-read our own server's status (never the browser's word).
  const [confirming, setConfirming] = useState(false);
  const [gatewayError, setGatewayError] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ['retailer', 'payment', id],
    queryFn: () => api.get<RetailerPaymentResponse>(`/retailer/orders/${id}/payment`),
    refetchInterval: (query) => (confirming && !['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(query.state.data?.payment.status ?? '') ? 4000 : false),
  });
  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 120_000);
    return () => clearTimeout(t);
  }, [confirming]);

  const payOnline = useMutation({
    mutationFn: async () => {
      setGatewayError(null);
      const options = await api.post<CheckoutOptions>(`/retailer/orders/${id}/payment/razorpay/order`, {});
      const result = await openRazorpayCheckout(options, (msg) => setGatewayError(msg));
      if (!result) return { outcome: 'dismissed' as const };
      setConfirming(true);
      return api.post<{ outcome: string }>(`/retailer/orders/${id}/payment/razorpay/verify`, { ...result });
    },
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['retailer'] });
      if (r.outcome === 'paid') {
        setConfirming(false);
        toast({ tone: 'success', title: 'Payment confirmed by Razorpay', description: 'Your suppliers can now prepare the order.' });
      } else if (r.outcome === 'failed') {
        setConfirming(false);
        setGatewayError('Razorpay reported that the payment failed. No money was taken — you can try again.');
      } else if (r.outcome !== 'dismissed') {
        toast({ tone: 'info', title: 'Confirming your payment', description: 'We are waiting for Razorpay to confirm it. This page updates automatically.' });
      }
    },
    onError: (e) => {
      setConfirming(false);
      setGatewayError(errorMessage(e));
    },
  });

  const submit = useMutation({
    mutationFn: (ref: string) => {
      const fd = new FormData();
      fd.append('reference', ref);
      if (receipt) fd.append('receipt', receipt, receipt.name);
      return api.post<{ payment: RetailerPayment }>(`/retailer/orders/${id}/payment/submit`, fd);
    },
    onSuccess: () => {
      setReceipt(null);
      void qc.invalidateQueries({ queryKey: ['retailer'] });
      toast({ tone: 'success', title: 'Payment details submitted', description: 'Our team will verify your transaction.' });
    },
  });

  if (q.isLoading) return <PageLoader />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} />;
  const d = q.data!;
  const p = d.payment;
  const open = p.status === 'PENDING' || p.status === 'REJECTED' || p.status === 'FAILED';
  const canSubmit = open && !!d.instructions;
  const online = open && !!d.gateway;

  const onSubmit = () => {
    const r = paymentReferenceSchema.safeParse(reference);
    if (!r.success) return setRefError(r.error.issues[0]?.message ?? 'Check the reference');
    setRefError(null);
    submit.mutate(r.data);
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ tone: 'success', title: 'UPI ID copied' });
    } catch {
      toast({ tone: 'error', title: 'Could not copy — please select the UPI ID and copy it manually' });
    }
  };

  return (
    <>
      <PageHeader
        title="Pay for your order"
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            Order <Link to={`/account/orders/${id}`} className="font-semibold text-copper-600 hover:underline">{d.orderNumber}</Link> · <PaymentBadge payment={p} />
          </span>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-5">
          {/* Amount due — always the server's figure */}
          <section className="overflow-hidden rounded-xl border border-brand-900/15 bg-gradient-to-br from-brand-900 via-brand-800 to-copper-600 p-5 text-white sm:p-6" aria-label="Amount due">
            <p className="text-xs font-semibold tracking-[0.2em] text-gold-300 uppercase">{p.status === 'PAID' || p.status === 'PARTIALLY_REFUNDED' || p.status === 'REFUNDED' ? 'Amount paid' : 'Amount due'}</p>
            <p className="mt-1 font-serif text-4xl font-semibold tabular-nums" data-testid="amount-due">
              {formatINR(p.amountPaise)}
            </p>
            <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm text-white/85 sm:grid-cols-2">
              <div>
                <dt className="inline text-white/60">Order </dt>
                <dd className="inline font-medium">{d.orderNumber}</dd>
              </div>
              <div>
                <dt className="inline text-white/60">Payment reference </dt>
                <dd className="inline font-mono">{p.internalReference}</dd>
              </div>
            </dl>
          </section>

          {p.status === 'SUBMITTED' && (
            <Alert tone="info" title="Payment details submitted. Our team will verify your transaction.">
              UTR <span className="font-mono">{p.reference}</span> was submitted on {formatDate(p.submittedAt!, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}. Your order is not marked paid until we have found the payment in our account — you&apos;ll get a notification.
            </Alert>
          )}
          {(p.status === 'PAID' || p.status === 'PARTIALLY_REFUNDED') && (
            <Alert tone="success" title="Payment verified">
              Verified on {formatDate(p.verifiedAt!, { day: 'numeric', month: 'short', year: 'numeric' })}. Your suppliers can now prepare and dispatch the order.
              {p.refundedPaise > 0 && <> {formatINR(p.refundedPaise)} has been refunded.</>}
            </Alert>
          )}
          {p.status === 'REFUNDED' && <Alert tone="info" title="Refunded">{formatINR(p.refundedPaise)} was refunded for this order.</Alert>}
          {p.status === 'CANCELLED' && <Alert tone="info" title="No payment due">This order was cancelled, so nothing needs to be paid.</Alert>}
          {p.status === 'REJECTED' && (
            <Alert tone="danger" title="We could not verify your previous submission">
              {p.rejectionReason} Please check the transaction in your UPI app and submit the correct reference below.
            </Alert>
          )}
          {p.status === 'FAILED' && (
            <Alert tone="danger" title="Your last online payment did not go through">
              {p.failureReason ?? 'The payment was not completed.'} No money is taken for a failed payment. You can try again below.
            </Alert>
          )}
          {open && !d.instructions && !d.gateway && (
            <Alert tone="warning" title="UPI payment is not available right now">
              Please contact Dhaaga Bazaar support{d.support.phone ? ` on ${d.support.phone}` : ''}{d.support.email ? ` or ${d.support.email}` : ''} for payment instructions. Do not pay anyone who contacts you with different bank details.
            </Alert>
          )}

          {online && (
            <Panel title="Pay online">
              <div className="space-y-3 text-sm">
                <p className="text-muted">Pay securely with UPI, cards, net banking or wallets through Razorpay. Your order is marked paid as soon as Razorpay confirms the payment to us.</p>
                {d.gateway?.mode === 'test' && (
                  <Alert tone="warning" title="Test mode">
                    Online payments are in Razorpay test mode — no real money is charged. Use Razorpay test cards or test UPI IDs.
                  </Alert>
                )}
                {gatewayError && <Alert tone="danger">{gatewayError}</Alert>}
                {confirming ? (
                  <p className="flex items-center gap-2 font-medium text-copper-700" role="status">
                    <Loader2 className="size-4 animate-spin" aria-hidden /> Confirming your payment with Razorpay…
                  </p>
                ) : (
                  <Button size="lg" variant="copper" icon={<CreditCard className="size-4" />} loading={payOnline.isPending} onClick={() => payOnline.mutate()}>
                    Pay {formatINR(p.amountPaise)} now
                  </Button>
                )}
                <p className="flex items-center gap-1.5 text-xs text-muted">
                  <ShieldCheck className="size-3.5 text-success" aria-hidden /> Card and UPI details are entered on Razorpay&apos;s secure checkout and never reach Dhaaga Bazaar.
                </p>
              </div>
            </Panel>
          )}

          {canSubmit && d.instructions && (
            <>
              <Panel title={online ? 'Or pay with the Dhaaga Bazaar UPI QR' : '1 · Scan and pay with any UPI app'}>
                <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
                  <figure className="w-full max-w-[17rem] shrink-0 rounded-xl border border-line bg-white p-3 shadow-sm">
                    <img src={d.instructions.qrUrl} alt={`UPI QR code for ${d.instructions.beneficiaryName}`} className="aspect-square w-full object-contain" />
                    <figcaption className="mt-2 flex items-center justify-center gap-1.5 text-center text-xs text-muted">
                      <QrCode className="size-3.5" aria-hidden /> Official Dhaaga Bazaar payment QR
                    </figcaption>
                  </figure>
                  <div className="w-full space-y-3 text-sm">
                    <dl className="space-y-2">
                      <div>
                        <dt className="text-xs text-muted">Beneficiary</dt>
                        <dd className="font-semibold" data-testid="beneficiary">{d.instructions.beneficiaryName}</dd>
                      </div>
                      {d.instructions.upiId && (
                        <div>
                          <dt className="text-xs text-muted">UPI ID</dt>
                          <dd className="flex flex-wrap items-center gap-2">
                            <span className="font-mono break-all">{d.instructions.upiId}</span>
                            <Button size="sm" variant="subtle" icon={<Copy className="size-3.5" />} onClick={() => copy(d.instructions!.upiId!)}>
                              Copy UPI ID
                            </Button>
                          </dd>
                        </div>
                      )}
                      <div>
                        <dt className="text-xs text-muted">Amount to pay</dt>
                        <dd className="font-semibold">{formatINR(p.amountPaise)} — exactly this amount</dd>
                      </div>
                    </dl>
                    <ol className="list-decimal space-y-1 pl-5 text-muted">
                      <li>Open GPay, PhonePe, Paytm, BHIM or your bank&apos;s UPI app.</li>
                      <li>Scan the QR{d.instructions.upiId ? ' or pay to the UPI ID' : ''} and check the beneficiary name matches.</li>
                      <li>Pay {formatINR(p.amountPaise)} and add <span className="font-mono">{p.internalReference}</span> in the remark if your app allows.</li>
                      <li>Copy the 12-digit UPI transaction ID (UTR) from the success screen and submit it below.</li>
                    </ol>
                    {d.instructions.upiUri && (
                      <a href={d.instructions.upiUri} className="inline-flex h-10 items-center gap-2 rounded-md bg-copper-500 px-4 text-sm font-medium text-white hover:bg-copper-600 sm:hidden">
                        <Smartphone className="size-4" aria-hidden /> Open UPI app
                      </a>
                    )}
                    {d.instructions.instructions && <p className="rounded-lg bg-ivory-light p-3 whitespace-pre-line">{d.instructions.instructions}</p>}
                  </div>
                </div>
              </Panel>

              <Panel title={online ? 'Then submit your UPI payment details' : '2 · Submit your payment details'}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input
                    label="UPI transaction ID / UTR"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    error={refError ?? undefined}
                    hint="12 digits, shown as UTR / UPI Ref No. in your payment app"
                    inputMode="text"
                    autoComplete="off"
                    required
                  />
                  <div>
                    <span className="mb-1.5 block text-sm font-medium">Payment screenshot (optional)</span>
                    <input
                      ref={fileInput}
                      type="file"
                      accept={RECEIPT_TYPES.join(',')}
                      className="hidden"
                      data-testid="receipt-input"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = '';
                        if (!f) return;
                        if (!RECEIPT_TYPES.includes(f.type)) return toast({ tone: 'error', title: 'Upload a JPG, PNG, WebP or PDF' });
                        if (f.size > 5 * 1024 * 1024) return toast({ tone: 'error', title: 'The file is larger than 5 MB' });
                        setReceipt(f);
                      }}
                    />
                    {receipt ? (
                      <div className="flex h-11 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm">
                        <FileUp className="size-4 text-muted" aria-hidden />
                        <span className="min-w-0 flex-1 truncate">{receipt.name}</span>
                        <button type="button" onClick={() => setReceipt(null)} className="rounded p-1 text-muted hover:text-danger" aria-label="Remove screenshot">
                          <X className="size-4" />
                        </button>
                      </div>
                    ) : (
                      <Button variant="subtle" className="w-full" icon={<FileUp className="size-4" />} onClick={() => fileInput.current?.click()}>
                        Attach screenshot
                      </Button>
                    )}
                  </div>
                </div>
                {submit.error && (
                  <Alert tone="danger" className="mt-4">
                    {errorMessage(submit.error)}
                  </Alert>
                )}
                <Button size="lg" className="mt-4 w-full sm:w-auto" loading={submit.isPending} onClick={onSubmit}>
                  Submit payment details
                </Button>
                <p className="mt-2 text-xs text-muted">Submitting details does not mark the order paid. Our team checks the transaction in Dhaaga Bazaar&apos;s bank account first.</p>
              </Panel>
            </>
          )}

          {p.history.length > 0 && (
            <Panel title="Payment history">
              <ol className="space-y-2 text-sm">
                {p.history.map((h, i) => (
                  <li key={i} className="flex flex-wrap items-baseline gap-x-2">
                    <Clock className="size-3.5 shrink-0 translate-y-0.5 text-muted" aria-hidden />
                    <span className="font-medium">{HISTORY_LABELS[h.type] ?? h.type}</span>
                    <span className="text-xs text-muted">{formatDate(h.at, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</span>
                    {h.note && <span className="w-full pl-5 text-xs text-muted">{h.note}</span>}
                  </li>
                ))}
              </ol>
            </Panel>
          )}
        </div>

        <aside className="space-y-4">
          <Panel title="Your payment is protected">
            <ul className="space-y-2 text-sm text-muted">
              <li className="flex gap-2"><Lock className="size-4 shrink-0 text-success" aria-hidden /> Pay only to the QR and beneficiary shown on this page.</li>
              <li className="flex gap-2"><CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden /> Your order is marked paid only after our team verifies the credit.</li>
              <li className="flex gap-2"><Lock className="size-4 shrink-0 text-success" aria-hidden /> Never share your UPI PIN, OTP or bank password — Dhaaga Bazaar will never ask for them.</li>
            </ul>
          </Panel>
          {(d.support.phone || d.support.email) && (
            <Panel title="Payment help">
              <p className="flex items-start gap-2 text-sm">
                <LifeBuoy className="mt-0.5 size-4 shrink-0 text-copper-500" aria-hidden />
                <span>
                  {d.support.phone && <a href={`tel:${d.support.phone}`} className="block font-medium hover:text-copper-600">{d.support.phone}</a>}
                  {d.support.email && <a href={`mailto:${d.support.email}`} className="block break-all hover:text-copper-600">{d.support.email}</a>}
                </span>
              </p>
            </Panel>
          )}
          {d.instructions?.paymentTerms && (
            <Panel title="Payment terms">
              <p className="text-xs whitespace-pre-line text-muted">{d.instructions.paymentTerms}</p>
            </Panel>
          )}
          {d.refundPolicy && (
            <Panel title="Refunds">
              <p className="text-xs whitespace-pre-line text-muted">{d.refundPolicy}</p>
            </Panel>
          )}
        </aside>
      </div>
    </>
  );
}

const HISTORY_LABELS: Record<string, string> = {
  GATEWAY_ORDER_CREATED: 'Online payment started',
  GATEWAY_CAPTURED: 'Payment received via Razorpay',
  GATEWAY_FAILED: 'Online payment failed',
  REFUND_FAILED: 'Refund failed — our team will retry',
  CREATED: 'Order placed — payment due',
  SUBMITTED: 'Payment details submitted',
  VERIFIED: 'Payment verified',
  REJECTED: 'Submission could not be verified',
  AMOUNT_UPDATED: 'Amount due updated',
  REFUND: 'Refund issued',
  CANCELLED: 'Payment cancelled',
};
