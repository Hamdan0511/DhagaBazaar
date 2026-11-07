import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, MapPin, Plus, QrCode, Store } from 'lucide-react';
import { formatINR, formatNumber } from '@dhaaga/shared';
import { api, errorMessage } from '@/lib/api';
import type { Address } from '@/lib/types';
import { CART_KEY, useCart } from '@/hooks/useCommerce';
import { Alert, Breadcrumbs, ErrorState, PageLoader } from '@/components/ui/Feedback';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Field';
import { AddressForm } from '@/components/dashboard/AddressForm';
import { cn } from '@/lib/utils';
import { toast } from '@/stores/ui';

export default function CheckoutPage() {
  const cart = useCart();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const profile = useQuery({ queryKey: ['retailer', 'profile'], queryFn: () => api.get<{ profile: { addresses: Address[] } }>('/retailer/profile') });
  const addresses = profile.data?.profile.addresses ?? [];
  const [addressId, setAddressId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [notes, setNotes] = useState('');
  // One key per checkout attempt: a retried or double-clicked submit returns the same order.
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const options = useQuery({ queryKey: ['retailer', 'payment-options'], queryFn: () => api.get<{ upiQr: boolean; gateway: boolean }>('/retailer/payment-options') });
  const gateway = !!options.data?.gateway;
  const upiQr = !!options.data?.upiQr;
  const [choice, setChoice] = useState<'RAZORPAY' | 'UPI_QR' | null>(null);
  const method = choice ?? (gateway ? 'RAZORPAY' : upiQr ? 'UPI_QR' : null);
  const upi = !!method;
  useEffect(() => {
    document.title = 'Request bulk order · Dhaaga Bazaar';
  }, []);
  useEffect(() => {
    if (!addressId && addresses.length) setAddressId((addresses.find((a) => a.isDefault) ?? addresses[0]).id);
  }, [addresses, addressId]);

  const submit = useMutation({
    mutationFn: () =>
      api.post<{ order: { id: string; orderNumber: string }; payment: { id: string; status: string } | null }>('/retailer/orders', {
        addressId: addressId ?? '',
        notes: notes || undefined,
        idempotencyKey,
        ...(method ? { paymentMethod: method } : {}),
      }),
    onSuccess: ({ order, payment }) => {
      void qc.invalidateQueries({ queryKey: CART_KEY });
      void qc.invalidateQueries({ queryKey: ['retailer'] });
      if (payment) {
        toast({ tone: 'success', title: `Order ${order.orderNumber} placed`, description: 'Complete the payment to send it into fulfilment.' });
        navigate(`/account/orders/${order.id}/pay`, { replace: true });
      } else {
        toast({ tone: 'success', title: 'Bulk order request submitted', description: `Order ${order.orderNumber} has been sent to your suppliers.` });
        navigate(`/account/orders/${order.id}?placed=1`, { replace: true });
      }
    },
  });

  if (cart.isLoading || profile.isLoading || options.isLoading) return <PageLoader />;
  if (cart.isError) return <div className="container-page py-12"><ErrorState message={errorMessage(cart.error)} /></div>;
  const data = cart.data!;
  if (!submit.isSuccess && (data.suppliers.length === 0 || !data.canCheckout)) return <Navigate to="/cart" replace />;

  return (
    <div className="container-page py-8">
      <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Cart', to: '/cart' }, { label: 'Request order' }]} />
      <h1 className="mt-4 font-serif text-3xl font-semibold">Request your bulk order</h1>
      <p className="mt-1 text-sm text-muted">
        {upi
          ? 'Each supplier reviews and confirms its part of the order. Pay the full amount after placing the order; suppliers dispatch once your payment is confirmed.'
          : 'Each supplier will review and confirm its part of the order before dispatch. No payment is collected on Dhaaga Bazaar at this stage.'}
      </p>
      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <section className="rounded-xl border border-line bg-white p-5" aria-labelledby="delivery">
            <h2 id="delivery" className="flex items-center gap-2 font-serif text-lg font-semibold">
              <MapPin className="size-5 text-copper-500" aria-hidden /> Delivery address
            </h2>
            {addresses.length > 0 && !adding && (
              <ul className="mt-4 grid gap-3 sm:grid-cols-2" role="radiogroup">
                {addresses.map((a) => (
                  <li key={a.id}>
                    <button
                      role="radio"
                      aria-checked={addressId === a.id}
                      onClick={() => setAddressId(a.id)}
                      className={cn('w-full rounded-lg border p-4 text-left text-sm transition-colors', addressId === a.id ? 'border-copper-500 bg-copper-50 ring-1 ring-copper-500' : 'border-line-strong hover:border-copper-400')}
                    >
                      <span className="font-semibold">{a.label}</span>
                      {a.isDefault && <span className="ml-2 rounded bg-brand-100 px-1.5 text-xs">Default</span>}
                      <span className="mt-1 block text-muted">
                        {a.contactName} · {a.phone}
                        <br />
                        {a.line1}
                        {a.line2 ? `, ${a.line2}` : ''}, {a.city}, {a.state} {a.pincode}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {adding || addresses.length === 0 ? (
              <div className="mt-4">
                <AddressForm
                  onDone={(a) => {
                    setAddressId(a.id);
                    setAdding(false);
                  }}
                  onCancel={addresses.length ? () => setAdding(false) : undefined}
                />
              </div>
            ) : (
              <Button variant="link" className="mt-3" onClick={() => setAdding(true)}>
                <Plus className="size-4" /> Add another address
              </Button>
            )}
          </section>
          <section className="rounded-xl border border-line bg-white p-5" aria-labelledby="groups">
            <h2 id="groups" className="font-serif text-lg font-semibold">
              Supplier order groups
            </h2>
            <ul className="mt-3 divide-y divide-line">
              {data.suppliers.map((g) => (
                <li key={g.supplierId} className="py-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 font-medium">
                      <Store className="size-4 text-muted" aria-hidden /> {g.supplierName}
                    </span>
                    <span className="font-semibold">{formatINR(g.subtotalPaise)}</span>
                  </div>
                  <ul className="mt-1.5 space-y-0.5 pl-6 text-xs text-muted">
                    {g.lines.map((l) => (
                      <li key={l.id}>
                        {formatNumber(l.quantity)} × {l.title}
                        {(l.size || l.colour) && ` (${[l.size, l.colour].filter(Boolean).join(' / ')})`}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </section>
          <section className="rounded-xl border border-line bg-white p-5" aria-labelledby="payment">
            <h2 id="payment" className="flex items-center gap-2 font-serif text-lg font-semibold">
              <QrCode className="size-5 text-copper-500" aria-hidden /> Payment
            </h2>
            {upi ? (
              <div role="radiogroup" aria-label="Payment method" className="mt-3 grid gap-3">
                {gateway && (
                  <button role="radio" aria-checked={method === 'RAZORPAY'} onClick={() => setChoice('RAZORPAY')} className={cn('w-full rounded-lg border p-4 text-left text-sm', method === 'RAZORPAY' ? 'border-copper-500 bg-copper-50 ring-1 ring-copper-500' : 'border-line-strong hover:border-copper-400')}>
                    <span className="font-semibold">Pay online — UPI, cards, net banking, wallets</span>
                    <span className="mt-1 block text-muted">Secure Razorpay checkout. Your order is confirmed for fulfilment as soon as Razorpay confirms the payment.</span>
                  </button>
                )}
                {upiQr && (
                  <button role="radio" aria-checked={method === 'UPI_QR'} onClick={() => setChoice('UPI_QR')} className={cn('w-full rounded-lg border p-4 text-left text-sm', method === 'UPI_QR' ? 'border-copper-500 bg-copper-50 ring-1 ring-copper-500' : 'border-line-strong hover:border-copper-400')}>
                    <span className="font-semibold">UPI QR payment</span>
                    <span className="mt-1 block text-muted">Scan the Dhaaga Bazaar UPI QR, then submit the transaction reference (UTR). Our team verifies it before fulfilment.</span>
                  </button>
                )}
                <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
                  <Lock className="size-3.5" aria-hidden /> We never ask for your UPI PIN, OTP or bank password.
                </p>
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted">Online payment is not enabled yet. Your suppliers will confirm the order and payment terms will be shared with you.</p>
            )}
          </section>
          <Textarea label="Notes for suppliers (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} placeholder="Packing preferences, delivery timing, GST invoice details…" />
        </div>
        <aside className="h-fit rounded-xl border border-line bg-white p-5 lg:sticky lg:top-[13.5rem]">
          <h2 className="font-serif text-lg font-semibold">Summary</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Supplier groups</dt>
              <dd>{data.suppliers.length}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Total quantity</dt>
              <dd>{formatNumber(data.totalQuantity)}</dd>
            </div>
            <div className="flex justify-between border-t border-line pt-3 text-base font-semibold">
              <dt>{upi ? 'Amount payable' : 'Estimated subtotal'}</dt>
              <dd>{formatINR(data.subtotalPaise)}</dd>
            </div>
          </dl>
          {submit.error && (
            <Alert tone="danger" className="mt-4">
              {errorMessage(submit.error)}
            </Alert>
          )}
          <Button size="lg" className="mt-5 w-full" disabled={!addressId} loading={submit.isPending} onClick={() => submit.mutate()}>
            {method === 'RAZORPAY' ? 'Place order and pay online' : method === 'UPI_QR' ? 'Place order and pay by UPI' : 'Submit bulk order request'}
          </Button>
          <p className="mt-3 text-xs text-muted">Prices are snapshotted on submission. Final invoice, taxes and shipping are confirmed by each supplier.</p>
        </aside>
      </div>
    </div>
  );
}
