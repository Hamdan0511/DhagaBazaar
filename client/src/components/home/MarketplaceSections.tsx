import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  BadgeCheck,
  Boxes,
  Check,
  ClipboardList,
  Factory,
  Handshake,
  IndianRupee,
  LayoutGrid,
  MapPin,
  PackageSearch,
  ShoppingBag,
  Store,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { ListingResponse } from '@/lib/types';
import { ButtonLink } from '@/components/ui/Button';
import { FixtureBadge, SmartImage } from '@/components/ui/Feedback';
import { ProductCard } from '@/components/catalog/ProductCard';
import { useAuth } from '@/hooks/useAuth';
import { useCategories } from '@/lib/categories';
import { sellWholesaleTo } from '@/lib/entryPoints';
import { sectionImages } from '@/lib/images';
import { titleCase } from '@/lib/utils';

function Heading({ id, eyebrow, title, description, link }: { id: string; eyebrow: string; title: string; description?: string; link?: { to: string; label: string } }) {
  return (
    <div className="mb-7 flex flex-col gap-3 sm:mb-9 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl">
        <p className="eyebrow mb-2">{eyebrow}</p>
        <h2 id={id} className="section-title">
          {title}
        </h2>
        {description && <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted sm:text-base">{description}</p>}
      </div>
      {link && (
        <Link to={link.to} className="group inline-flex shrink-0 items-center gap-2 text-[0.9375rem] font-medium text-copper-600 hover:text-brand-900">
          {link.label} <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </Link>
      )}
    </div>
  );
}

/** Two equal cards — one per side of the marketplace. */
export function TwoSidedMarketplace() {
  const { user } = useAuth();
  const sides = [
    {
      icon: ShoppingBag,
      eyebrow: 'Buy wholesale',
      title: 'For retail businesses',
      who: ['Clothing retailers', 'Boutique owners', 'Resellers', 'Fashion stores', 'Online clothing sellers'],
      features: ['Browse wholesale products', 'Discover suppliers', 'Compare product options', 'Manage bulk orders', 'Track purchases'],
      cta: user?.role === 'RETAILER' ? { label: 'Go to my dashboard', to: '/account' } : { label: 'Register as Retailer', to: '/register/retailer' },
      tone: 'light' as const,
    },
    {
      icon: Factory,
      eyebrow: 'Sell wholesale',
      title: 'For garment businesses',
      who: ['Garment manufacturers', 'Wholesalers', 'Distributors', 'Clothing businesses'],
      features: ['Register your business', 'Upload clothing collections', 'Manage inventory', 'Receive retailer orders', 'Manage wholesale sales'],
      cta: user?.role === 'SUPPLIER' ? { label: 'Go to supplier portal', to: '/supplier' } : { label: 'Register as Supplier', to: sellWholesaleTo(user) },
      tone: 'dark' as const,
    },
  ];
  return (
    <section className="bg-white py-14 sm:py-16" aria-labelledby="two-sided">
      <div className="container-page">
        <div className="mx-auto mb-9 max-w-2xl text-center">
          <p className="eyebrow mb-2">One marketplace, two sides</p>
          <h2 id="two-sided" className="section-title">
            Buy or Sell Wholesale Garments
          </h2>
          <p className="mt-2 text-muted">Retailers source stock in bulk. Suppliers reach those retailers. Choose the side that fits your business.</p>
        </div>
        <ul className="grid gap-5 md:grid-cols-2">
          {sides.map(({ icon: Icon, eyebrow, title, who, features, cta, tone }) => {
            const dark = tone === 'dark';
            return (
              <li key={eyebrow} className={`flex flex-col rounded-2xl border p-6 sm:p-8 ${dark ? 'border-brand-900 bg-brand-900 text-white' : 'border-gold-400/60 bg-ivory-light'}`}>
                <div className="flex items-center gap-4">
                  <span className={`flex size-14 shrink-0 items-center justify-center rounded-full ring-1 ${dark ? 'bg-white/10 text-gold-300 ring-gold-300/50' : 'bg-white text-copper-600 ring-gold-400/60'}`}>
                    <Icon className="size-7 stroke-[1.4]" aria-hidden />
                  </span>
                  <div>
                    <p className={`text-xs font-semibold tracking-[0.25em] uppercase ${dark ? 'text-gold-300' : 'text-copper-600'}`}>{eyebrow}</p>
                    <h3 className={`mt-1 font-serif text-2xl font-semibold ${dark ? 'text-white' : 'text-brand-900'}`}>{title}</h3>
                  </div>
                </div>
                <p className={`mt-5 text-sm ${dark ? 'text-white/70' : 'text-muted'}`}>For</p>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {who.map((w) => (
                    <li key={w} className={`rounded-full px-3 py-1 text-xs font-medium ${dark ? 'bg-white/10 text-white' : 'bg-white text-brand-900 ring-1 ring-line'}`}>
                      {w}
                    </li>
                  ))}
                </ul>
                <ul className="mt-5 flex-1 space-y-2.5 text-[0.9375rem]">
                  {features.map((f) => (
                    <li key={f} className="flex gap-2.5">
                      <Check className={`mt-0.5 size-5 shrink-0 ${dark ? 'text-gold-300' : 'text-success'}`} aria-hidden /> {f}
                    </li>
                  ))}
                </ul>
                <ButtonLink to={cta.to} variant={dark ? 'copper' : 'primary'} size="lg" className="mt-7 w-full">
                  {cta.label} <ArrowRight className="size-4" aria-hidden />
                </ButtonLink>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

/** What a retailer gets — the buyer-side counterpart of the supplier banner. */
export function RetailerEssentials() {
  const { user } = useAuth();
  const items = [
    { icon: PackageSearch, title: 'Discover wholesale clothing', body: 'Browse garment listings from approved suppliers.' },
    { icon: Handshake, title: 'Connect with garment suppliers', body: 'View supplier profiles and send bulk enquiries.' },
    { icon: LayoutGrid, title: 'Explore many categories', body: "Women's, men's and kids' wear, footwear, fabrics and accessories." },
    { icon: Boxes, title: 'Purchase products in bulk', body: 'One cart for many suppliers, split into an order for each.' },
    { icon: IndianRupee, title: 'Check MOQ and wholesale prices', body: 'Every listing shows its price and minimum order quantity.' },
    { icon: ClipboardList, title: 'Manage orders in one dashboard', body: 'Follow every order from request to dispatch.' },
  ];
  const cta = user?.role === 'RETAILER' ? { label: 'Go to my dashboard', to: '/account' } : { label: 'Join as a Retailer', to: '/register/retailer' };
  return (
    <section className="bg-ivory py-14 sm:py-16" aria-labelledby="retailer-essentials">
      <div className="container-page grid gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center">
        <div>
          <div className="relative mb-7 hidden aspect-[16/10] overflow-hidden rounded-2xl bg-brand-100 lg:block">
            <SmartImage src={sectionImages.textileMarket.src} alt={sectionImages.textileMarket.alt} className="absolute inset-0 size-full object-cover" />
          </div>
          <p className="eyebrow mb-2">For retailers & boutiques</p>
          <h2 id="retailer-essentials" className="section-title">
            Everything Your Clothing Business Needs
          </h2>
          <p className="mt-3 max-w-lg leading-relaxed text-muted">
            Source stock for your shop from manufacturers, wholesalers and distributors — with wholesale prices and MOQs shown upfront.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <ButtonLink to={cta.to} variant="copper" size="lg" className="bg-copper-600 hover:bg-brand-900">
              <Store className="size-5" aria-hidden /> {cta.label}
            </ButtonLink>
            <ButtonLink to="/categories" variant="outline" size="lg">
              Browse products
            </ButtonLink>
          </div>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2">
          {items.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex gap-4 rounded-xl border border-line bg-white p-5">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-ivory-light text-copper-600 ring-1 ring-gold-400/50">
                <Icon className="size-5 stroke-[1.5]" aria-hidden />
              </span>
              <div>
                <h3 className="font-serif text-base font-semibold text-brand-900">{title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted">{body}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** Newest approved listings straight from the database; an honest note when there are none yet. */
export function NewArrivals() {
  const q = useQuery({ queryKey: ['home', 'new-arrivals'], queryFn: () => api.get<ListingResponse>('/products?sort=newest&pageSize=8') });
  const items = q.data?.items ?? [];
  return (
    <section className="container-page pb-12 sm:pb-14" aria-labelledby="new-arrivals">
      <Heading id="new-arrivals" eyebrow="Fresh from suppliers" title="New Arrivals" link={items.length ? { to: '/search?sort=newest', label: 'See all new listings' } : undefined} />
      {q.isLoading ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4" aria-hidden>
          {Array.from({ length: 4 }, (_, i) => (
            <li key={i} className="aspect-[3/4] animate-pulse rounded-xl bg-brand-100/60" />
          ))}
        </ul>
      ) : items.length ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4">
          {items.map((p) => (
            <li key={p.id}>
              <ProductCard product={p} />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyNote
          text={q.isError ? 'New listings could not be loaded right now.' : 'No products are available yet. New listings will appear here as soon as they are approved.'}
          link={{ to: '/categories', label: 'Browse categories' }}
        />
      )}
    </section>
  );
}

interface SupplierRow {
  id: string;
  businessName: string;
  businessType: string;
  city: string | null;
  state: string | null;
  isVerified: boolean;
  isFixture: boolean;
  categoryPaths: string[];
  _count: { products: number };
}

/** Approved suppliers from the database (same source as the supplier directory). */
export function ShopBySupplier() {
  const { user } = useAuth();
  const cats = useCategories();
  const q = useQuery({ queryKey: ['suppliers', ''], queryFn: () => api.get<{ suppliers: SupplierRow[] }>('/suppliers') });
  const suppliers = (q.data?.suppliers ?? []).slice(0, 6);
  return (
    <section className="container-page pb-12 sm:pb-14" aria-labelledby="shop-by-supplier">
      <Heading id="shop-by-supplier" eyebrow="Manufacturers, wholesalers & distributors" title="Shop by Supplier" link={suppliers.length ? { to: '/suppliers', label: 'Supplier directory' } : undefined} />
      {q.isLoading ? (
        <div className="h-28 animate-pulse rounded-xl bg-brand-100/60" aria-hidden />
      ) : suppliers.length ? (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {suppliers.map((s) => (
            <li key={s.id} className="min-w-0">
              <Link to={`/suppliers/${s.id}`} className="group flex h-full items-start gap-4 rounded-xl border border-line bg-white p-5 transition-shadow hover:shadow-[var(--shadow-lift)]">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-ivory text-copper-600 ring-1 ring-gold-400/50">
                  <Factory className="size-6 stroke-[1.4]" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 font-serif text-lg font-semibold text-brand-900 group-hover:text-copper-600">
                    <span className="truncate">{s.businessName}</span>
                    {s.isVerified && <BadgeCheck className="size-4 shrink-0 text-success" aria-label="Verified supplier" />}
                  </span>
                  <span className="mt-0.5 block text-sm text-muted">
                    {titleCase(s.businessType)}
                    {s.city && (
                      <>
                        {' · '}
                        <MapPin className="inline size-3.5 align-[-2px]" aria-hidden /> {s.city}
                      </>
                    )}
                  </span>
                  <span className="mt-2 block truncate text-xs text-muted">
                    {s.categoryPaths
                      .map((p) => cats.get(p)?.name)
                      .filter(Boolean)
                      .slice(0, 3)
                      .join(', ') || 'Garments'}{' '}
                    · {s._count.products} {s._count.products === 1 ? 'listing' : 'listings'}
                  </span>
                  {s.isFixture && <FixtureBadge className="mt-2" />}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyNote
          text={q.isError ? 'Suppliers could not be loaded right now.' : 'No suppliers are currently listed. Supplier profiles appear here once their businesses are approved.'}
          link={{ to: sellWholesaleTo(user), label: 'Register as Supplier' }}
        />
      )}
    </section>
  );
}

function EmptyNote({ text, link }: { text: string; link: { to: string; label: string } }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-dashed border-line-strong bg-white/70 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted">{text}</p>
      <Link to={link.to} className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-copper-600 hover:text-brand-900">
        {link.label} <ArrowRight className="size-4" aria-hidden />
      </Link>
    </div>
  );
}
