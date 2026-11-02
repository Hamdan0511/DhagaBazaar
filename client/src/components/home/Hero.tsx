import { Link } from 'react-router-dom';
import { ArrowRight, Boxes, Factory, Handshake, Layers, ShoppingBag } from 'lucide-react';
import { ButtonLink } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import { sellWholesaleTo } from '@/lib/entryPoints';
import { heroImages, promoImages } from '@/lib/images';

const PROMOS = [
  { title: 'Sarees', sub: 'Wholesale Collection', to: '/categories/womens-wear/sarees', image: promoImages.sarees },
  { title: 'Kurtis', sub: 'Latest Styles in Bulk', to: '/categories/womens-wear/kurtis', image: promoImages.kurtis },
  { title: 'Dress Materials', sub: 'Unstitched Collections', to: '/categories/womens-wear/dress-materials', image: promoImages.dressMaterials },
];

const HIGHLIGHTS = [
  { icon: Boxes, title: 'Bulk Ordering', sub: 'with MOQ' },
  { icon: Layers, title: 'Multiple Categories', sub: 'Men, Women, Kids & More' },
  { icon: Handshake, title: 'Supplier Discovery', sub: 'Manufacturers & Wholesalers' },
];

function PromoCard({ title, sub, to, image }: (typeof PROMOS)[number]) {
  return (
    <Link
      to={to}
      className="group relative flex h-[6.6rem] overflow-hidden rounded-xl border border-white/70 bg-white/90 shadow-[var(--shadow-card)] backdrop-blur-sm transition-shadow hover:shadow-[var(--shadow-lift)] xl:h-[6.9rem]"
    >
      <div className="relative z-10 flex flex-1 flex-col justify-center pl-5">
        <span className="font-serif text-[1.45rem] leading-tight font-semibold text-brand-900">{title}</span>
        <span className="mt-1 flex items-center gap-1.5 text-[0.8125rem] text-charcoal/80">
          {sub} <ArrowRight className="size-3.5 text-copper-500 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </span>
      </div>
      <div className="absolute inset-y-0 right-0 w-[46%] [clip-path:polygon(22%_0,100%_0,100%_100%,0_100%)]">
        <img src={image.src} alt={image.alt} loading="eager" className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
      </div>
    </Link>
  );
}

export function Hero() {
  const { user } = useAuth();
  return (
    <section className="relative overflow-hidden bg-textile" aria-labelledby="hero-title">
      {/* Photograph — right side on desktop, top on mobile */}
      {/* The photo fades itself out with a mask, so it blends into the textile background without a seam. */}
      <div className="relative h-[21rem] [mask-image:linear-gradient(to_bottom,black_62%,transparent)] sm:h-[26rem] lg:absolute lg:inset-y-0 lg:right-0 lg:h-auto lg:w-[55%] 2xl:w-[60%] lg:[mask-image:linear-gradient(to_right,transparent_0%,rgb(0_0_0/0.55)_10%,black_24%)]">
        <img
          src={heroImages.saree.src}
          alt={heroImages.saree.alt}
          fetchPriority="high"
          width={2000}
          height={1320}
          className="absolute inset-0 size-full object-cover object-[22%_20%] sm:object-[18%_20%] lg:object-[0%_22%]"
        />
      </div>

      <div className="container-page relative">
        <div className="grid items-center gap-8 pb-10 lg:min-h-[28.5rem] lg:grid-cols-[minmax(0,1fr)_21rem] lg:py-10 xl:grid-cols-[minmax(0,1fr)_22.5rem]">
          {/* Copy */}
          <div className="-mt-20 max-w-[46rem] rounded-2xl bg-[#f6ede1]/92 p-6 sm:-mt-24 sm:p-8 lg:mt-0 lg:bg-transparent lg:p-0 xl:pl-6">
            <p className="eyebrow">B2B Garment Marketplace</p>
            <h1 id="hero-title" className="mt-4 font-serif text-[2.35rem] leading-[1.08] font-semibold tracking-[-0.01em] text-brand-900 sm:text-5xl lg:text-[3.3rem] xl:text-[3.6rem]">
              Wholesale Fashion
              <br />
              for Your Business
            </h1>
            <p className="mt-5 max-w-[34rem] text-[1.0625rem] leading-relaxed text-charcoal/85 sm:text-lg">
              Discover trusted garment suppliers, explore wholesale collections and grow your retail business with bulk purchasing made easier.
            </p>
            {/* One CTA per side of the marketplace, same size: buying first, selling second. */}
            <div className="mt-7 grid gap-3 sm:max-w-[34rem] sm:grid-cols-2 sm:gap-4">
              <ButtonLink to="/categories" variant="copper" size="lg" className="bg-copper-600 hover:bg-brand-900">
                <ShoppingBag className="size-5" aria-hidden /> Start Buying Wholesale
              </ButtonLink>
              <ButtonLink to={sellWholesaleTo(user)} variant="outline" size="lg" className="border-2 bg-white/60">
                <Factory className="size-5" aria-hidden /> Become a Supplier
              </ButtonLink>
            </div>
            {!user && (
              <p className="mt-3 text-sm text-charcoal/75">
                Buying for your shop?{' '}
                <Link to="/register/retailer" className="link font-medium">
                  Register as a retailer
                </Link>
              </p>
            )}
            <ul className="mt-8 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:gap-y-3">
              {HIGHLIGHTS.map(({ icon: Icon, title, sub }, i) => (
                <li key={title} className={`flex items-center gap-3 sm:px-4 xl:px-5 ${i === 0 ? 'sm:pl-0 xl:pl-0' : 'sm:border-l sm:border-brand-900/15'}`}>
                  <Icon className="size-8 shrink-0 stroke-[1.25] text-copper-600" aria-hidden />
                  <span className="leading-tight whitespace-nowrap">
                    <span className="block font-serif text-[0.95rem] font-semibold text-brand-900">{title}</span>
                    <span className="text-xs text-muted">{sub}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Promotional category cards */}
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1 lg:gap-3.5">
            {PROMOS.map((p) => (
              <PromoCard key={p.title} {...p} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
