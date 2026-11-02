import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Lock, ShoppingCart, Store, Trash2 } from 'lucide-react';
import { PRICE_UNIT_SHORT, formatINR, formatNumber } from '@dhaaga/shared';
import { api, errorMessage } from '@/lib/api';
import type { Cart, CartLine } from '@/lib/types';
import { CART_KEY, useCart } from '@/hooks/useCommerce';
import { homeFor, useAuth } from '@/hooks/useAuth';
import { Alert, Breadcrumbs, EmptyState, ErrorState, FixtureBadge, PageLoader, SmartImage } from '@/components/ui/Feedback';
import { Button, ButtonLink } from '@/components/ui/Button';
import { toast, useUi } from '@/stores/ui';
import { PLACEHOLDER_IMAGE } from '@/lib/images';

function LineQuantity({ line }: { line: CartLine }) {
  const qc = useQueryClient();
  const [value, setValue] = useState(String(line.quantity));
  useEffect(() => { setValue(String(line.quantity)); }, [line.quantity]);
  const update = useMutation({
    mutationFn: (quantity: number) => api.patch<Cart>(`/cart/items/${line.id}`, { quantity }),
    onSuccess: (cart) => qc.setQueryData(CART_KEY, cart),
    onError: (e) => {
      setValue(String(line.quantity));
      toast({ tone: 'error', title: 'Quantity not updated', description: errorMessage(e) });
    },
  });
  const commit = () => {
    const n = Number.parseInt(value, 10);
    if (!Number.isFinite(n) || n < 1) return setValue(String(line.quantity));
    if (n !== line.quantity) update.mutate(n);
  };
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted">Qty</span>
      <input
        inputMode="numeric"
        value={value}
        onChange={(e) => setValue(e.target.value.replace(/\D/g, ''))}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        disabled={update.isPending}
        className="h-9 w-20 rounded-md border border-line-strong px-2 text-center tabular-nums focus:border-copper-500 focus:outline-none"
        aria-label={`Quantity for ${line.title}`}
      />
    </label>
  );
}

export default function CartPage() {
  const { user, isLoading } = useAuth();
  const openAuth = useUi((s) => s.openAuth);
  const cart = useCart();
  const qc = useQueryClient();
  useEffect(() => {
    document.title = 'Your Cart · Dhaaga Bazaar';
  }, []);
  const remove = useMutation({
    mutationFn: (url: string) => api.delete<Cart>(url),
    onSuccess: (c) => qc.setQueryData(CART_KEY, c),
    onError: (e) => toast({ tone: 'error', title: 'Could not remove item', description: errorMessage(e) }),
  });

  if (isLoading) return <PageLoader />;
  if (!user) {
    return (
      <div className="container-page py-12">
        <h1 className="mb-6 text-center font-serif text-3xl font-semibold">Your bulk order cart</h1>
        <EmptyState
          icon={<Lock className="size-7" />}
          title="Sign in to view your cart"
          description="Your bulk order cart is saved to your Dhaaga Bazaar account so you can build orders across devices."
          actions={
            <>
              <Button onClick={() => openAuth({ mode: 'login' })}>Sign in</Button>
              <Button variant="subtle" onClick={() => openAuth({ mode: 'register' })}>
                Create account
              </Button>
            </>
          }
        />
      </div>
    );
  }
  if (user.role !== 'RETAILER') {
    return (
      <div className="container-page py-12">
        <EmptyState title="Carts are for retailer accounts" description="Supplier and admin accounts manage the marketplace from their portals." actions={<ButtonLink to={homeFor(user)}>Go to your portal</ButtonLink>} />
      </div>
    );
  }
  if (cart.isLoading) return <PageLoader label="Loading your cart…" />;
  if (cart.isError) return <div className="container-page py-12"><ErrorState message={errorMessage(cart.error)} onRetry={() => cart.refetch()} /></div>;
  const data = cart.data!;

  return (
    <div className="container-page py-8">
      <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Cart' }]} />
      <h1 className="mt-4 font-serif text-3xl font-semibold">Your bulk order cart</h1>
      {data.suppliers.length === 0 ? (
        <EmptyState
          className="mt-8"
          icon={<ShoppingCart className="size-7" />}
          title="Your cart is empty"
          description="Add products from supplier listings. Items from different suppliers are grouped automatically."
          actions={<ButtonLink to="/categories">Explore collections</ButtonLink>}
        />
      ) : (
        <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="space-y-6">
            <p className="text-sm text-muted">
              Your cart has {data.suppliers.length} supplier group{data.suppliers.length === 1 ? '' : 's'}. Each supplier receives and fulfils its own part of the order.
            </p>
            {data.suppliers.map((g) => (
              <section key={g.supplierId} className="overflow-hidden rounded-xl border border-line bg-white" aria-label={`Items from ${g.supplierName}`}>
                <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-brand-50 px-4 py-3">
                  <Link to={`/suppliers/${g.supplierId}`} className="flex items-center gap-2 font-semibold text-brand-900 hover:text-copper-600">
                    <Store className="size-4" aria-hidden /> {g.supplierName}
                    {g.supplierCity && <span className="text-sm font-normal text-muted">· {g.supplierCity}</span>}
                  </Link>
                  {g.isFixture && <FixtureBadge />}
                  <span className="text-sm text-muted">Subtotal {formatINR(g.subtotalPaise)}</span>
                </header>
                {g.issues.map((msg) => (
                  <div key={msg} className="flex items-start gap-2 border-b border-line bg-danger-bg px-4 py-2.5 text-sm text-danger">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                    <span>{msg}</span>
                  </div>
                ))}
                {g.products
                  .filter((p) => p.moqError || p.stockError)
                  .map((p) => (
                    <div key={p.productId} className="flex items-start gap-2 border-b border-line bg-danger-bg px-4 py-2.5 text-sm text-danger">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                      <span>
                        <span className="font-medium">{p.title}:</span> {p.moqError ? `${p.moqError} You have ${formatNumber(p.totalQuantity)} across all options.` : ''} {p.stockError}
                      </span>
                    </div>
                  ))}
                <ul className="divide-y divide-line">
                  {g.lines.map((l) => (
                    <li key={l.id} className="flex gap-4 p-4">
                      <Link to={`/products/${l.productId}`} className="relative size-20 shrink-0 overflow-hidden rounded-lg bg-brand-50 sm:size-24">
                        <SmartImage src={l.imageUrl ?? PLACEHOLDER_IMAGE.src} alt="" className="absolute inset-0 size-full object-cover" />
                      </Link>
                      <div className="min-w-0 flex-1">
                        <Link to={`/products/${l.productId}`} className="line-clamp-2 font-medium text-charcoal hover:text-copper-600">
                          {l.title}
                        </Link>
                        <p className="mt-0.5 text-xs text-muted">
                          {l.categoryName}
                          {(l.size || l.colour) && ` · ${[l.size, l.colour].filter(Boolean).join(' / ')}`}
                        </p>
                        <p className="mt-1 text-sm">
                          {formatINR(l.unitPricePaise)} <span className="text-muted">/ {PRICE_UNIT_SHORT[l.priceUnit]}</span>
                        </p>
                        {l.issue && <p className="mt-1 text-sm text-danger">{l.issue}</p>}
                        <div className="mt-3 flex flex-wrap items-center gap-4">
                          <LineQuantity line={l} />
                          <button onClick={() => remove.mutate(`/cart/items/${l.id}`)} className="flex items-center gap-1 text-sm text-muted hover:text-danger">
                            <Trash2 className="size-4" aria-hidden /> Remove
                          </button>
                          <span className="ml-auto font-semibold tabular-nums">{formatINR(l.lineTotalPaise)}</span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            <button onClick={() => remove.mutate('/cart')} className="text-sm text-muted hover:text-danger">
              Clear cart
            </button>
          </div>
          <aside className="h-fit rounded-xl border border-line bg-white p-5 lg:sticky lg:top-[13.5rem]">
            <h2 className="font-serif text-lg font-semibold">Order summary</h2>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Suppliers</dt>
                <dd>{data.suppliers.length}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Total quantity</dt>
                <dd>{formatNumber(data.totalQuantity)}</dd>
              </div>
              <div className="flex justify-between border-t border-line pt-3 text-base font-semibold">
                <dt>Subtotal</dt>
                <dd>{formatINR(data.subtotalPaise)}</dd>
              </div>
            </dl>
            <p className="mt-2 text-xs text-muted">Taxes, shipping and final pricing are confirmed by each supplier.</p>
            {data.issues.map((msg) => (
              <Alert key={msg} tone="danger" className="mt-4">
                {msg}
              </Alert>
            ))}
            {!data.canCheckout && (
              <Alert tone="warning" className="mt-4">
                Fix the highlighted MOQ, minimum order value or availability issues to continue.
              </Alert>
            )}
            {data.canCheckout ? (
              <ButtonLink to="/checkout" size="lg" className="mt-5 w-full">
                Continue to request order
              </ButtonLink>
            ) : (
              <Button size="lg" className="mt-5 w-full" disabled>
                Continue to request order
              </Button>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
