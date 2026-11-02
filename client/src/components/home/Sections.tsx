import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Boxes,
  ClipboardList,
  FileSearch,
  Handshake,
  LayoutGrid,
  MessagesSquare,
  PackageCheck,
  Ruler,
  Search,
  Store,
  Truck,
  Upload,
  UserPlus,
  Users,
  Warehouse,
} from 'lucide-react';
import { ButtonLink } from '@/components/ui/Button';
import { SmartImage } from '@/components/ui/Feedback';
import { useCategories } from '@/lib/categories';
import { getCategoryImage, sectionImages, PLACEHOLDER_IMAGE } from '@/lib/images';
import { categoryUrl, cn } from '@/lib/utils';
import { useRecent } from '@/stores/recent';

export function FeatureStrip() {
  const items = [
    { icon: LayoutGrid, title: 'Wide Product Range', sub: 'Across all garment categories' },
    { icon: Handshake, title: 'Connect with Suppliers', sub: 'Manufacturers, wholesalers & distributors' },
    { icon: Boxes, title: 'Bulk Ordering', sub: 'With MOQ & wholesale pricing' },
    { icon: Store, title: 'For Retail Businesses', sub: 'Boutiques, stores & online sellers' },
  ];
  return (
    <section aria-label="Why retailers use Dhaaga Bazaar" className="border-y border-line bg-ivory">
      <ul className="container-page grid grid-cols-2 gap-y-6 py-6 lg:grid-cols-4 lg:py-7">
        {items.map(({ icon: Icon, title, sub }, i) => (
          <li key={title} className={cn('flex items-center gap-3.5 px-2 sm:px-4 lg:justify-center', i > 0 && 'lg:border-l lg:border-brand-900/15', i % 2 === 1 && 'border-l border-brand-900/15 lg:border-l')}>
            <Icon className="size-9 shrink-0 stroke-[1.15] text-copper-600 sm:size-10" aria-hidden />
            <span className="leading-tight">
              <span className="block font-serif text-[0.95rem] font-semibold text-brand-900 sm:text-base">{title}</span>
              <span className="text-xs text-muted sm:text-[0.8125rem]">{sub}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SectionHeading({ eyebrow, title, description, link }: { eyebrow?: string; title: string; description?: string; link?: { to: string; label: string } }) {
  return (
    <div className="mb-7 flex flex-col gap-3 sm:mb-9 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl">
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h2 className="section-title">{title}</h2>
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

export function ShopByCategory() {
  const cats = useCategories();
  return (
    <section className="container-page py-12 sm:py-14" aria-labelledby="shop-by-category">
      <div className="mb-7 flex items-end justify-between gap-4">
        <h2 id="shop-by-category" className="section-title sm:text-[2.5rem]">
          Shop by Category
        </h2>
        <Link to="/categories" className="group inline-flex shrink-0 items-center gap-2 text-[0.9375rem] font-medium text-copper-600 hover:text-brand-900">
          View All Categories <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </Link>
      </div>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-6">
        {cats.roots.slice(0, 6).map((c, i) => {
          const image = getCategoryImage(c.path) ?? PLACEHOLDER_IMAGE;
          const featured = i === 0;
          return (
            <li key={c.path}>
              <Link
                to={categoryUrl(c.path)}
                className={cn(
                  'group relative flex h-36 overflow-hidden rounded-xl border bg-gradient-to-br from-[#f8f0e5] to-[#efe1cd] transition-shadow hover:shadow-[var(--shadow-lift)] sm:h-40',
                  featured ? 'border-gold-400 ring-1 ring-gold-400/40' : 'border-line',
                )}
              >
                <div className="relative w-[46%] shrink-0 overflow-hidden xl:w-[44%]">
                  <SmartImage src={image.src} alt={image.alt} className="absolute inset-0 size-full object-cover object-top transition-transform duration-500 group-hover:scale-[1.05]" />
                  <div className="absolute inset-y-0 right-0 w-8 bg-gradient-to-r from-transparent to-[#f3e7d6]" />
                </div>
                <div className="flex min-w-0 flex-1 flex-col justify-center py-3 pr-2 pl-2.5 sm:pl-3">
                  {featured && <span className="mb-1.5 w-fit rounded-full bg-brand-900 px-2 py-0.5 text-[0.5625rem] font-semibold tracking-wide text-white uppercase">Featured</span>}
                  <span className="font-serif text-base leading-tight font-semibold text-brand-900 sm:text-[1.1rem] xl:text-[1rem] 2xl:text-[1.1rem]">{c.name}</span>
                  <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap text-copper-600">
                    Explore Now <ArrowRight className="size-3 shrink-0 transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Representative image tile for a category — illustrative imagery, never a listing. */
export function CategoryTile({ path, name, blurb, aspect = 'aspect-[4/5]', className }: { path: string; name: string; blurb?: string; aspect?: string; className?: string }) {
  const image = getCategoryImage(path);
  return (
    <Link to={categoryUrl(path)} className={cn('group block overflow-hidden rounded-xl border border-line bg-white transition-shadow hover:shadow-[var(--shadow-lift)]', className)}>
      <div className={cn('relative overflow-hidden bg-brand-100', aspect)}>
        <SmartImage
          src={(image ?? PLACEHOLDER_IMAGE).src}
          alt={image ? `${image.alt} (illustrative category image)` : ''}
          className={cn('absolute inset-0 size-full transition-transform duration-500 group-hover:scale-[1.04]', image ? 'object-cover object-top' : 'object-contain p-6')}
        />
      </div>
      <div className="p-3.5 sm:p-4">
        <div className="font-serif text-[1.05rem] font-semibold text-brand-900 sm:text-lg">{name}</div>
        {blurb && <p className="mt-0.5 line-clamp-1 text-[0.8125rem] text-muted">{blurb}</p>}
        <span className="mt-2 inline-flex items-center gap-1 text-[0.8125rem] font-medium text-copper-600">
          Browse category <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </span>
      </div>
    </Link>
  );
}

const WOMENS_FEATURED = ['sarees', 'kurtis', 'kurtas', 'salwar-suits', 'dupattas', 'lehengas', 'gowns', 'dress-materials', 'blouses', 'tops', 'dresses', 'co-ord-sets'];

export function WomensCollection() {
  const cats = useCategories();
  const items = WOMENS_FEATURED.map((s) => cats.get(`womens-wear/${s}`)).filter(Boolean) as NonNullable<ReturnType<typeof cats.get>>[];
  return (
    <section className="bg-white py-14 sm:py-16" aria-labelledby="womens-collection">
      <div className="container-page">
        <div className="mb-7 flex flex-col gap-3 sm:mb-9 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <p className="eyebrow mb-2">Featured collection · Our launch focus</p>
            <h2 id="womens-collection" className="section-title">
              Women&apos;s Wear Collection
            </h2>
            <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted sm:text-base">
              From Kanjeevaram-style silks to everyday kurtis — explore the ethnic and contemporary categories boutiques and retailers source most.
            </p>
          </div>
          <Link to="/categories/womens-wear" className="group inline-flex shrink-0 items-center gap-2 text-[0.9375rem] font-medium text-copper-600 hover:text-brand-900">
            All Women&apos;s Wear <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </Link>
        </div>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4 xl:grid-cols-6">
          {items.map((c) => (
            <li key={c.path}>
              <CategoryTile path={c.path} name={c.name} blurb={c.blurb} />
            </li>
          ))}
        </ul>
        <p className="mt-5 text-xs text-muted">Illustrative category imagery — not available for purchase. Supplier listings appear inside each category as they are published.</p>
      </div>
    </section>
  );
}

function SplitCollection({ rootPath, eyebrow, title, description, subs, reverse = false, tone = 'ivory' }: { rootPath: string; eyebrow: string; title: string; description: string; subs: string[]; reverse?: boolean; tone?: 'ivory' | 'white' }) {
  const cats = useCategories();
  const root = getCategoryImage(rootPath);
  const items = subs.map((s) => cats.get(`${rootPath}/${s}`)).filter(Boolean) as NonNullable<ReturnType<typeof cats.get>>[];
  return (
    <section className={cn('py-14 sm:py-16', tone === 'ivory' ? 'bg-ivory-light' : 'bg-white')} aria-label={title}>
      <div className="container-page">
        <div className={cn('grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-8', reverse && 'lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]')}>
          <Link to={categoryUrl(rootPath)} className={cn('group relative min-h-[22rem] overflow-hidden rounded-2xl bg-brand-900', reverse && 'lg:order-2')}>
            {root && <SmartImage src={root.src} alt={`${root.alt} (illustrative category image)`} className="absolute inset-0 size-full object-cover object-top opacity-90 transition-transform duration-700 group-hover:scale-[1.03]" />}
            <div className="absolute inset-0 bg-gradient-to-t from-brand-950/90 via-brand-950/35 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8">
              <p className="text-xs font-semibold tracking-[0.3em] text-gold-300 uppercase">{eyebrow}</p>
              <h2 className="mt-2 font-serif text-3xl font-semibold text-white sm:text-4xl">{title}</h2>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-white/85">{description}</p>
              <span className="mt-5 inline-flex items-center gap-2 rounded-md bg-white px-4 py-2.5 text-sm font-medium text-brand-900 transition-colors group-hover:bg-ivory">
                Explore {title} <ArrowRight className="size-4" aria-hidden />
              </span>
            </div>
          </Link>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
            {items.map((c) => (
              <li key={c.path}>
                <CategoryTile path={c.path} name={c.name} blurb={c.blurb} aspect="aspect-[4/3.6]" />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

export function MensCollection() {
  return (
    <SplitCollection
      rootPath="mens-wear"
      eyebrow="Menswear"
      title="Men's Wear"
      description="Shirts, tees, denim, formal wear and festive ethnic wear for menswear stores."
      subs={['shirts', 't-shirts', 'formal-wear', 'jeans', 'kurtas', 'sherwanis']}
      tone="ivory"
    />
  );
}

export function KidsCollection() {
  return (
    <SplitCollection
      rootPath="kids-wear"
      eyebrow="Kidswear"
      title="Kids' Wear"
      description="Everyday, festive, party and school wear for babies, girls and boys."
      subs={['girls-clothing', 'boys-clothing', 'baby-clothing', 'ethnic-wear', 'western-wear', 'school-uniforms']}
      reverse
      tone="white"
    />
  );
}

export function FootwearAccessories() {
  const cats = useCategories();
  const panels = [
    { root: 'footwear', title: 'Footwear', subs: ['ethnic-footwear', 'womens-footwear', 'mens-footwear', 'sandals'] },
    { root: 'accessories', title: 'Accessories', subs: ['bags', 'belts', 'scarves', 'stoles'] },
    { root: 'fabrics', title: 'Fabrics & Textiles', subs: ['silk-fabrics', 'cotton-fabrics', 'printed-fabrics', 'embroidered-fabrics'] },
  ];
  return (
    <section className="bg-ivory-light py-14 sm:py-16" aria-labelledby="more-collections">
      <div className="container-page">
        <SectionHeading eyebrow="Complete your range" title="Footwear, Accessories & Fabrics" description="Round out your store with footwear, bags and accessories — or source fabrics by the metre and bolt." link={{ to: '/categories', label: 'Browse everything' }} />
        <h2 id="more-collections" className="sr-only">
          More collections
        </h2>
        <div className="grid gap-6 lg:grid-cols-3">
          {panels.map((p) => (
            <div key={p.root} className="rounded-2xl border border-line bg-white p-4 sm:p-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-serif text-xl font-semibold text-brand-900">{p.title}</h3>
                <Link to={categoryUrl(p.root)} className="text-sm font-medium text-copper-600 hover:underline">
                  View all
                </Link>
              </div>
              <ul className="grid grid-cols-2 gap-3">
                {p.subs.map((s) => {
                  const c = cats.get(`${p.root}/${s}`);
                  const img = getCategoryImage(`${p.root}/${s}`);
                  if (!c) return null;
                  return (
                    <li key={s}>
                      <Link to={categoryUrl(c.path)} className="group block">
                        <div className="relative aspect-square overflow-hidden rounded-lg bg-brand-100">
                          <SmartImage src={(img ?? PLACEHOLDER_IMAGE).src} alt={img ? `${img.alt} (illustrative)` : ''} className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-[1.05]" />
                        </div>
                        <div className="mt-2 text-sm font-medium text-charcoal group-hover:text-copper-600">{c.name}</div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** `headingLevel="h1"` when the section is the main content of its own page (/how-it-works). */
export function HowItWorks({ headingLevel: Heading = 'h2' }: { headingLevel?: 'h1' | 'h2' }) {
  const [tab, setTab] = useState<'retailers' | 'suppliers'>('retailers');
  const steps = {
    retailers: [
      { icon: Search, title: 'Explore wholesale collections', body: 'Browse categories and filter listings by MOQ, price, fabric, size and supplier location.' },
      { icon: MessagesSquare, title: 'Discover suppliers & request bulk orders', body: 'Send enquiries or add products to a cart that groups items by supplier, then submit your bulk order request.' },
      { icon: Truck, title: 'Coordinate & receive from suppliers', body: 'Each supplier confirms its part of your order and ships directly to you. Track every group from your dashboard.' },
    ],
    suppliers: [
      { icon: UserPlus, title: 'Register your business', body: 'Create a supplier account, add your business details and upload verification documents for review.' },
      { icon: Upload, title: 'Showcase your garment catalogue', body: 'List products with your own photos, wholesale prices, MOQ, sizes and colours. Listings go live after review.' },
      { icon: Handshake, title: 'Connect with retailers', body: 'Receive bulk enquiries and order requests, confirm them, and share dispatch details with retailers.' },
    ],
  }[tab];
  return (
    <section className="bg-white py-14 sm:py-16" aria-labelledby="how-it-works">
      <div className="container-page">
        <div className="mx-auto max-w-2xl text-center">
          <p className="eyebrow mb-2">Simple wholesale sourcing</p>
          <Heading id="how-it-works" className="section-title">
            How Dhaaga Bazaar Works
          </Heading>
          <div className="mx-auto mt-6 inline-grid grid-cols-2 rounded-full border border-line bg-ivory-light p-1 text-sm font-medium" role="tablist">
            {(['retailers', 'suppliers'] as const).map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cn('rounded-full px-5 py-2 transition-colors sm:px-7', tab === t ? 'bg-brand-900 text-white' : 'text-brand-900 hover:bg-white')}>
                For {t === 'retailers' ? 'Retailers' : 'Suppliers'}
              </button>
            ))}
          </div>
        </div>
        <ol className="relative mt-10 grid gap-6 md:grid-cols-3 md:gap-8">
          <div className="absolute top-9 right-[16%] left-[16%] hidden h-px bg-gradient-to-r from-transparent via-gold-400 to-transparent md:block" aria-hidden />
          {steps.map(({ icon: Icon, title, body }, i) => (
            <li key={title} className="relative flex flex-col items-center text-center">
              <div className="relative flex size-[4.5rem] items-center justify-center rounded-full border border-gold-400/60 bg-ivory-light text-copper-600">
                <Icon className="size-7 stroke-[1.4]" aria-hidden />
                <span className="absolute -top-1 -right-1 flex size-6 items-center justify-center rounded-full bg-brand-900 text-xs font-semibold text-white">{i + 1}</span>
              </div>
              <h3 className="mt-5 font-serif text-lg font-semibold text-brand-900">{title}</h3>
              <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted">{body}</p>
            </li>
          ))}
        </ol>
        <div className="mt-10 text-center">
          <ButtonLink to="/how-it-works" variant="subtle">
            Learn more about ordering
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}

export function WhyDhaaga() {
  const items = [
    { icon: LayoutGrid, title: 'Multiple garment categories', body: "Women's, men's and kids' wear, footwear, fabrics and accessories in one place." },
    { icon: FileSearch, title: 'Wholesale-focused discovery', body: 'Filters built for bulk buyers — MOQ, order quantity, wholesale price and supplier location.' },
    { icon: Ruler, title: 'MOQ transparency', body: "Every listing shows its minimum order quantity, and the cart won't let an order go below it." },
    { icon: Warehouse, title: 'Supplier discovery', body: 'Find manufacturers, wholesalers and distributors and view their public business profiles.' },
    { icon: ClipboardList, title: 'Bulk order enquiries', body: 'Ask suppliers about pricing, customisation or availability before you order.' },
    { icon: PackageCheck, title: 'Organised catalogues', body: 'Category-specific attributes make listings consistent and easy to compare.' },
  ];
  return (
    <section className="bg-ivory py-14 sm:py-16" aria-labelledby="why-dhaaga">
      <div className="container-page">
        <SectionHeading eyebrow="Built for B2B" title="Why Dhaaga Bazaar?" description="A marketplace designed around how garment retailers actually buy — in bulk, by category, from trusted sources." />
        <h2 id="why-dhaaga" className="sr-only">
          Why Dhaaga Bazaar
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex gap-4 rounded-xl border border-line bg-white p-5">
              <Icon className="size-8 shrink-0 stroke-[1.3] text-copper-600" aria-hidden />
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

export function SupplierBanner() {
  return (
    <section className="container-page py-14 sm:py-16" aria-labelledby="supplier-banner">
      <div className="relative overflow-hidden rounded-2xl bg-brand-950">
        <SmartImage src={sectionImages.weaving.src} alt={sectionImages.weaving.alt} className="absolute inset-0 size-full object-cover opacity-45" />
        <div className="absolute inset-0 bg-gradient-to-r from-brand-950 via-brand-950/85 to-brand-950/20" />
        <div className="relative grid gap-8 p-7 sm:p-10 lg:grid-cols-[1.4fr_1fr] lg:p-14">
          <div>
            <p className="text-xs font-semibold tracking-[0.3em] text-gold-300 uppercase">For manufacturers & wholesalers</p>
            <h2 id="supplier-banner" className="mt-3 max-w-xl font-serif text-3xl leading-tight font-semibold text-white sm:text-[2.6rem]">
              Take Your Garment Business Beyond Your Local Market
            </h2>
            <p className="mt-4 max-w-lg leading-relaxed text-white/80">
              List your collections, set your own wholesale prices and MOQs, and receive bulk enquiries from retailers and boutiques. You keep your inventory and ship directly.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <ButtonLink to="/become-a-supplier" variant="copper" size="lg">
                Register as a Supplier <ArrowRight className="size-4" aria-hidden />
              </ButtonLink>
              <ButtonLink to="/how-it-works#suppliers" size="lg" className="border border-white/40 bg-transparent text-white hover:bg-white hover:text-brand-900">
                How it works
              </ButtonLink>
            </div>
          </div>
          <ul className="grid content-center gap-3 text-sm text-white/90">
            {[
              [Users, 'Reach boutiques, retailers and resellers'],
              [Ruler, 'Your prices, your MOQ, your catalogue'],
              [Truck, 'You pack and ship directly to buyers'],
              [ClipboardList, 'Manage enquiries and orders in one portal'],
            ].map(([Icon, text]) => {
              const I = Icon as typeof Users;
              return (
                <li key={text as string} className="flex items-center gap-3 rounded-lg border border-white/15 bg-white/5 px-4 py-3 backdrop-blur-sm">
                  <I className="size-5 shrink-0 text-gold-300" aria-hidden />
                  {text as string}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}

/** Shown only to returning visitors, from this device's own browsing history. */
export function RecentlyViewed() {
  const recent = useRecent((s) => s.categories);
  const cats = useCategories();
  const items = recent.map((p) => cats.get(p)).filter(Boolean).slice(0, 6) as NonNullable<ReturnType<typeof cats.get>>[];
  if (items.length < 2) return null;
  return (
    <section className="container-page pb-12" aria-labelledby="recently-viewed">
      <h2 id="recently-viewed" className="mb-4 font-serif text-xl font-semibold text-brand-900">
        Continue browsing
      </h2>
      <ul className="scrollbar-none -mx-4 flex gap-3 overflow-x-auto px-4 sm:mx-0 sm:grid sm:grid-cols-3 sm:px-0 lg:grid-cols-6">
        {items.map((c) => {
          const img = getCategoryImage(c.path);
          return (
            <li key={c.path} className="w-40 shrink-0 sm:w-auto">
              <Link to={categoryUrl(c.path)} className="group flex items-center gap-3 rounded-xl border border-line bg-white p-2 pr-3 hover:shadow-[var(--shadow-card)]">
                <span className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-brand-100">
                  {img && <SmartImage src={img.src} alt="" className="absolute inset-0 size-full object-cover object-top" />}
                </span>
                <span className="truncate text-sm font-medium text-charcoal group-hover:text-copper-600">{c.name}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
