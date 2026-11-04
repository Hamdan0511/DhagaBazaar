import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { BadgeCheck, Clock, MapPin, MessageSquareText, Minus, PackageCheck, Plus, ShoppingCart, Store } from 'lucide-react';
import { FILTER_SETS, GENERAL_PRODUCT_FIELDS, PRICE_UNIT_SHORT, formatINR, formatNumber, tierUnitPricePaise, validateOrderQuantity, type FilterSetKey } from '@dhaaga/shared';
import { api, errorMessage } from '@/lib/api';
import type { ProductCardData, ProductDetail } from '@/lib/types';
import { useCategories } from '@/lib/categories';
import { categoryUrl, cn } from '@/lib/utils';
import { Alert, Breadcrumbs, EmptyState, ErrorState, FixtureBadge, PageLoader, SmartImage } from '@/components/ui/Feedback';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Overlay';
import { Input, Textarea } from '@/components/ui/Field';
import { ProductCard, SaveProductButton } from '@/components/catalog/ProductCard';
import { useCommerceAction } from '@/hooks/useCommerce';
import { useAuth } from '@/hooks/useAuth';
import { useRecent } from '@/stores/recent';
import { toast, useUi } from '@/stores/ui';
import { PLACEHOLDER_IMAGE } from '@/lib/images';

const unitWord = (u: string, n = 2) => (u === 'METRE' ? 'm' : u === 'PAIR' ? (n === 1 ? 'pair' : 'pairs') : u === 'SET' ? (n === 1 ? 'set' : 'sets') : 'pcs');

function QtyInput({ value, onChange, label, step = 1 }: { value: number; onChange: (n: number) => void; label: string; step?: number }) {
  return (
    <div className="inline-flex h-10 items-center rounded-md border border-line-strong bg-white">
      <button type="button" onClick={() => onChange(Math.max(0, value - step))} className="flex h-full w-8 items-center sm:w-9 justify-center text-muted hover:text-charcoal" aria-label={`Decrease ${label}`}>
        <Minus className="size-4" />
      </button>
      <input
        inputMode="numeric"
        value={value || ''}
        placeholder="0"
        onChange={(e) => onChange(Math.max(0, Number.parseInt(e.target.value.replace(/\D/g, '') || '0', 10)))}
        className="h-full w-12 border-x border-line text-center text-sm tabular-nums focus:outline-none sm:w-16"
        aria-label={label}
      />
      <button type="button" onClick={() => onChange(value + step)} className="flex h-full w-8 items-center sm:w-9 justify-center text-muted hover:text-charcoal" aria-label={`Increase ${label}`}>
        <Plus className="size-4" />
      </button>
    </div>
  );
}

function EnquiryModal({ product, open, onClose }: { product: ProductDetail; open: boolean; onClose: () => void }) {
  const [message, setMessage] = useState('');
  const [quantity, setQuantity] = useState(String(product.moq));
  const send = useMutation({
    mutationFn: () => api.post('/retailer/enquiries', { supplierId: product.supplier.id, productId: product.id, quantity: Number(quantity) || undefined, message }),
    onSuccess: () => {
      toast({ tone: 'success', title: 'Enquiry sent', description: `${product.supplier.businessName} will reply in your enquiries inbox.`, action: { label: 'View enquiries', to: '/account/enquiries' } });
      setMessage('');
      onClose();
    },
  });
  return (
    <Modal open={open} onClose={onClose} title="Send a bulk enquiry">
      <form
        className="space-y-4 p-6"
        onSubmit={(e) => {
          e.preventDefault();
          send.mutate();
        }}
      >
        <p className="text-sm text-muted">
          Ask <span className="font-medium text-charcoal">{product.supplier.businessName}</span> about pricing tiers, customisation, lead times or availability for “{product.title}”.
        </p>
        {send.error && <Alert tone="danger">{errorMessage(send.error)}</Alert>}
        <Input label="Approximate quantity" inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value.replace(/\D/g, ''))} hint={`Listing MOQ: ${formatNumber(product.moq)} ${unitWord(product.priceUnit)}`} />
        <Textarea label="Your message" required minLength={10} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="e.g. We need 200 pieces in assorted colours for Diwali. Can you share tiered pricing and dispatch time to Bengaluru?" data-autofocus />
        <Button type="submit" className="w-full" loading={send.isPending} disabled={message.trim().length < 10}>
          Send enquiry
        </Button>
      </form>
    </Modal>
  );
}

export default function ProductPage() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const cats = useCategories();
  const { user } = useAuth();
  const openAuth = useUi((s) => s.openAuth);
  const addRecent = useRecent((s) => s.addProduct);
  const { run, isPending } = useCommerceAction();
  const q = useQuery({ queryKey: ['product', id], queryFn: () => api.get<{ product: ProductDetail; related: ProductCardData[] }>(`/products/${id}`) });
  const product = q.data?.product;
  const [activeImage, setActiveImage] = useState(0);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const enquireOpen = params.get('enquire') === '1' && user?.role === 'RETAILER';

  useEffect(() => {
    if (!product) return;
    document.title = `${product.title} · Dhaaga Bazaar`;
    addRecent({ id: product.id, title: product.title });
    // Sensible starting quantity: the MOQ on the first available option.
    const first = product.variants.find((v) => v.isAvailable);
    setQty(product.variants.length ? (first ? { [first.id]: product.moq } : {}) : { single: product.moq });
    setActiveImage(0);
  }, [product, addRecent]);

  const total = useMemo(() => Object.values(qty).reduce((s, n) => s + n, 0), [qty]);
  useEffect(() => {
    setError(null); // a changed selection invalidates the previous MOQ message
  }, [qty]);
  const lineTotal = useMemo(() => {
    if (!product) return 0;
    // Volume tiers discount the base price by total quantity; option price overrides stay as set.
    const base = tierUnitPricePaise(product.pricePaise, product.priceTiers, total);
    if (!product.variants.length) return total * base;
    return product.variants.reduce((s, v) => s + (qty[v.id] ?? 0) * (v.pricePaise ?? base), 0);
  }, [product, qty, total]);

  if (q.isLoading) return <PageLoader label="Loading listing…" />;
  if (q.isError || !product) {
    return (
      <div className="container-page py-12">
        {q.error && (q.error as { status?: number }).status === 404 ? (
          <EmptyState title="This listing is not available" description="It may have been removed by the supplier or is awaiting review." actions={<ButtonLink to="/categories">Browse categories</ButtonLink>} />
        ) : (
          <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
        )}
      </div>
    );
  }

  const category = cats.get(product.category.path);
  const parent = category?.parentPath ? cats.get(category.parentPath) : undefined;
  const images = product.images.length ? product.images : [{ id: 'placeholder', url: PLACEHOLDER_IMAGE.src, altText: product.title, attribution: null }];
  const defs = FILTER_SETS[product.category.filterSet as FilterSetKey] ?? [];
  const attrRows = defs
    .map((d) => {
      const v = product.attributes[d.key];
      const values = Array.isArray(v) ? v : v ? [v] : [];
      return values.length ? { label: d.label, value: values.join(', ') } : null;
    })
    .concat(
      // Basic details (gender, product type, brand…) not already covered by the category's filters.
      GENERAL_PRODUCT_FIELDS.filter((f) => !defs.some((d) => d.key === f.key)).map((f) => {
        const v = product.attributes[f.key];
        const value = Array.isArray(v) ? v[0] : v;
        return value ? { label: f.label.replace(' (if applicable)', ''), value } : null;
      }),
    )
    .filter(Boolean) as { label: string; value: string }[];
  const outOfStock =
    product.availability === 'OUT_OF_STOCK' ||
    (!product.variants.length && product.stockQuantity === 0) ||
    (product.variants.length > 0 && product.variants.every((v) => !v.isAvailable || v.stockQuantity === 0));
  const unit = PRICE_UNIT_SHORT[product.priceUnit];

  const addToCart = () => {
    setError(null);
    const msg = validateOrderQuantity(total, product.moq, product.orderStep);
    if (msg) {
      setError(`${msg} Your selection totals ${formatNumber(total)}.`);
      return;
    }
    const lines = product.variants.length
      ? Object.entries(qty)
          .filter(([, n]) => n > 0)
          .map(([variantId, quantity]) => ({ variantId, quantity }))
      : [{ variantId: null, quantity: total }];
    run({ type: 'cart.add', productId: product.id, productTitle: product.title, lines }, 'Sign in to add products to your bulk order cart.');
  };

  const enquire = () => {
    if (!user) {
      openAuth({ mode: 'login', reason: 'Sign in to send bulk enquiries to suppliers.', pending: { type: 'navigate', to: `${location.pathname}?enquire=1`, label: 'Send enquiry' } });
      return;
    }
    if (user.role !== 'RETAILER') {
      toast({ tone: 'info', title: 'Retailer account required', description: 'Enquiries are sent from retailer accounts.' });
      return;
    }
    setParams((p) => {
      p.set('enquire', '1');
      return p;
    });
  };

  return (
    <div className="container-page py-6 sm:py-8">
      <Breadcrumbs
        items={[
          { label: 'Home', to: '/' },
          ...(parent ? [{ label: parent.name, to: categoryUrl(parent.path) }] : []),
          { label: product.category.name, to: categoryUrl(product.category.path) },
          { label: product.title },
        ]}
      />
      {product.isFixture && (
        <Alert tone="warning" className="mt-4" title="Development fixture">
          This is test data for checking the cart and filters. It is not a real product and is never shown in production.
        </Alert>
      )}
      <div className="mt-5 grid gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-12">
        {/* Gallery */}
        <div>
          <div className="relative aspect-[4/5] overflow-hidden rounded-xl border border-line bg-brand-50">
            <SmartImage src={images[activeImage]?.url} alt={images[activeImage]?.altText ?? product.title} eager className={cn('absolute inset-0 size-full', product.images.length ? 'object-contain' : 'object-contain p-16')} />
            <SaveProductButton id={product.id} title={product.title} className="absolute top-3 right-3" />
          </div>
          {images.length > 1 && (
            <ul className="scrollbar-none mt-3 flex gap-2 overflow-x-auto">
              {images.map((img, i) => (
                <li key={img.id}>
                  <button onClick={() => setActiveImage(i)} className={cn('relative size-20 overflow-hidden rounded-lg border-2', i === activeImage ? 'border-copper-500' : 'border-transparent')} aria-label={`Show image ${i + 1}`} aria-current={i === activeImage}>
                    <SmartImage src={img.url} alt="" className="absolute inset-0 size-full object-cover" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {images[activeImage]?.attribution && <p className="mt-2 text-xs text-muted">Photo: {images[activeImage].attribution}</p>}
          {images[activeImage]?.aiEnhanced && <p className="mt-2 text-xs text-muted">This photo of the supplier's product was enhanced with Dhaaga Bazaar AI (background, lighting and creases). The supplier confirmed it shows the actual item.</p>}
        </div>

        {/* Purchase panel */}
        <div>
          {product.isFixture && <FixtureBadge className="mb-2" />}
          <h1 className="font-serif text-2xl leading-snug font-semibold sm:text-3xl">{product.title}</h1>
          <Link to={`/suppliers/${product.supplier.id}`} className="mt-2 inline-flex items-center gap-1.5 text-sm text-muted hover:text-copper-600">
            <Store className="size-4" aria-hidden /> {product.supplier.businessName}
            {product.supplier.isVerified && (
              <span className="inline-flex items-center gap-1 text-success">
                <BadgeCheck className="size-4" aria-hidden /> Documents verified
              </span>
            )}
            {product.supplier.city && (
              <span className="inline-flex items-center gap-0.5">
                · <MapPin className="size-3.5" aria-hidden /> {product.supplier.city}
              </span>
            )}
          </Link>

          <div className="mt-5 rounded-xl border border-line bg-white p-5">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-3xl font-semibold text-brand-900">{formatINR(product.pricePaise)}</span>
              <span className="text-sm text-muted">
                per {unit}
                {product.priceUnit === 'SET' && product.piecesPerSet ? ` (${product.piecesPerSet} pieces per set)` : ''} · wholesale
              </span>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              <div className="rounded-lg bg-brand-50 p-3">
                <dt className="text-xs text-muted">Minimum order</dt>
                <dd className="mt-0.5 font-semibold text-copper-700">
                  {formatNumber(product.moq)} {unitWord(product.priceUnit, product.moq)}
                </dd>
              </div>
              {product.orderStep > 1 && (
                <div className="rounded-lg bg-brand-50 p-3">
                  <dt className="text-xs text-muted">Order in multiples of</dt>
                  <dd className="mt-0.5 font-semibold">{product.orderStep}</dd>
                </div>
              )}
              <div className="rounded-lg bg-brand-50 p-3">
                <dt className="text-xs text-muted">Availability</dt>
                <dd className={cn('mt-0.5 font-semibold', outOfStock ? 'text-danger' : 'text-success')}>
                  {outOfStock
                    ? 'Out of stock'
                    : product.availability === 'MADE_TO_ORDER'
                      ? 'Made to order'
                      : !product.variants.length && product.stockQuantity !== null
                        ? `${formatNumber(product.stockQuantity)} in stock`
                        : 'Available'}
                </dd>
              </div>
              {product.leadTimeDays != null && (
                <div className="rounded-lg bg-brand-50 p-3">
                  <dt className="flex items-center gap-1 text-xs text-muted">
                    <Clock className="size-3" aria-hidden /> Dispatch time
                  </dt>
                  <dd className="mt-0.5 font-semibold">{product.leadTimeDays === 0 ? 'Same day' : `${product.leadTimeDays} days`}</dd>
                </div>
              )}
            </dl>
            {!!product.priceTiers?.length && (
              <div className="mt-3 rounded-lg border border-gold-400/50 bg-ivory-light p-3 text-sm">
                <div className="text-xs font-semibold tracking-wide text-copper-700 uppercase">Volume pricing</div>
                <ul className="mt-1.5 space-y-1">
                  {product.priceTiers.map((t) => (
                    <li key={t.minQty} className="flex justify-between gap-3">
                      <span>
                        {formatNumber(t.minQty)}+ {unitWord(product.priceUnit, t.minQty)}
                      </span>
                      <span className="font-semibold tabular-nums">
                        {formatINR(t.pricePaise)} / {unit}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-1.5 text-xs text-muted">Applied automatically to the total quantity across all options.</p>
              </div>
            )}

            {/* Quantity selection */}
            <div className="mt-5">
              <div className="mb-2 flex items-baseline justify-between">
                <h2 className="text-sm font-semibold text-charcoal">Choose quantities</h2>
                <span className="text-xs text-muted">MOQ applies to the total across all options</span>
              </div>
              {product.variants.length ? (
                <div className="overflow-hidden rounded-lg border border-line">
                  <table className="w-full text-sm">
                    <thead className="bg-brand-50 text-left text-xs text-muted">
                      <tr>
                        <th className="px-2 py-2 sm:px-3 font-medium">Size</th>
                        <th className="px-2 py-2 sm:px-3 font-medium">Colour</th>
                        <th className="hidden px-2 py-2 sm:px-3 font-medium sm:table-cell">Price</th>
                        <th className="px-2 py-2 sm:px-3 text-right font-medium">Quantity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {product.variants.map((v) => (
                        <tr key={v.id} className="border-t border-line">
                          <td className="px-2 py-2 sm:px-3">{v.size ?? '—'}</td>
                          <td className="px-2 py-2 sm:px-3">{v.colour ?? '—'}</td>
                          <td className="hidden px-2 py-2 sm:px-3 tabular-nums sm:table-cell">{formatINR(v.pricePaise ?? product.pricePaise)}</td>
                          <td className="px-2 py-2 sm:px-3 text-right">
                            {v.stockQuantity !== null && <span className={cn('mb-1 block text-xs sm:mr-3 sm:mb-0 sm:inline', v.stockQuantity === 0 ? 'text-danger' : 'text-muted')}>{v.stockQuantity === 0 ? 'Sold out' : `${formatNumber(v.stockQuantity)} left`}</span>}
                            {v.isAvailable && v.stockQuantity !== 0 ? (
                              <QtyInput value={qty[v.id] ?? 0} onChange={(n) => setQty((s) => ({ ...s, [v.id]: n }))} label={`Quantity for ${[v.size, v.colour].filter(Boolean).join(' ')}`} step={product.orderStep} />
                            ) : (
                              <span className="text-xs text-muted">Unavailable</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <QtyInput value={qty.single ?? 0} onChange={(n) => setQty({ single: n })} label="Quantity" step={product.orderStep} />
              )}
              <div className="mt-3 flex items-center justify-between text-sm">
                <span className="text-muted">
                  Total: <span className={cn('font-semibold', total < product.moq ? 'text-danger' : 'text-charcoal')}>{formatNumber(total)}</span> {unitWord(product.priceUnit, total)}
                </span>
                <span className="font-semibold text-brand-900">{formatINR(lineTotal)}</span>
              </div>
              {error && (
                <Alert tone="danger" className="mt-3">
                  {error}
                </Alert>
              )}
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <Button size="lg" onClick={addToCart} loading={isPending} disabled={outOfStock} icon={<ShoppingCart className="size-5" />}>
                Add to Cart
              </Button>
              <Button size="lg" variant="outline" onClick={enquire} icon={<MessageSquareText className="size-5" />}>
                Send Enquiry
              </Button>
            </div>
            <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-muted">
              <PackageCheck className="mt-0.5 size-4 shrink-0 text-copper-500" aria-hidden />
              Orders are sent to the supplier as a bulk order request. The supplier confirms availability and ships directly to you.
            </p>
          </div>

          {attrRows.length > 0 && (
            <section className="mt-6" aria-labelledby="specs">
              <h2 id="specs" className="mb-2 font-serif text-lg font-semibold">
                Specifications
              </h2>
              <dl className="divide-y divide-line rounded-xl border border-line bg-white text-sm">
                {attrRows.map((r) => (
                  <div key={r.label} className="grid grid-cols-[10rem_1fr] gap-3 px-4 py-2.5">
                    <dt className="text-muted">{r.label}</dt>
                    <dd className="text-charcoal">{r.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
          <section className="mt-6" aria-labelledby="description">
            <h2 id="description" className="mb-2 font-serif text-lg font-semibold">
              Description
            </h2>
            <p className="text-sm leading-relaxed whitespace-pre-line text-charcoal/90">{product.description}</p>
          </section>
          <section className="mt-6 rounded-xl border border-line bg-ivory-light p-4 text-sm" aria-labelledby="about-supplier">
            <h2 id="about-supplier" className="font-serif text-base font-semibold">
              About the supplier
            </h2>
            <p className="mt-1 text-muted">
              {product.supplier.businessName} · {product.supplier.businessType.charAt(0) + product.supplier.businessType.slice(1).toLowerCase()}
              {product.supplier.yearEstablished ? ` · Since ${product.supplier.yearEstablished}` : ''}
              {product.supplier.minOrderValuePaise ? ` · Minimum order value ${formatINR(product.supplier.minOrderValuePaise)}` : ''}
            </p>
            <Link to={`/suppliers/${product.supplier.id}`} className="link mt-2 inline-block text-sm">
              View supplier profile →
            </Link>
          </section>
        </div>
      </div>

      {(q.data?.related.length ?? 0) > 0 && (
        <section className="mt-14" aria-labelledby="related">
          <h2 id="related" className="section-title mb-5 text-2xl sm:text-2xl">
            More in {product.category.name}
          </h2>
          <ul className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-4">
            {q.data!.related.map((p) => (
              <li key={p.id}>
                <ProductCard product={p} />
              </li>
            ))}
          </ul>
        </section>
      )}
      <EnquiryModal
        product={product}
        open={enquireOpen}
        onClose={() =>
          navigate({ pathname: location.pathname, search: '' }, { replace: true })
        }
      />
    </div>
  );
}
