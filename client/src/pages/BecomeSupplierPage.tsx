import { useEffect } from 'react';
import { ArrowRight, BadgeIndianRupee, ClipboardCheck, FileCheck2, Images, MessagesSquare, Ruler, Truck, UserPlus } from 'lucide-react';
import { ButtonLink } from '@/components/ui/Button';
import { SmartImage } from '@/components/ui/Feedback';
import { sectionImages } from '@/lib/images';
import { useAuth } from '@/hooks/useAuth';

export default function BecomeSupplierPage() {
  const { user } = useAuth();
  useEffect(() => {
    document.title = 'Become a Supplier · Dhaaga Bazaar';
  }, []);
  const cta =
    user?.role === 'SUPPLIER' ? (
      <ButtonLink to="/supplier" variant="copper" size="lg">
        Go to Supplier Portal <ArrowRight className="size-4" />
      </ButtonLink>
    ) : user ? null : (
      <ButtonLink to="/register/supplier" variant="copper" size="lg">
        Register as a Supplier <ArrowRight className="size-4" />
      </ButtonLink>
    );
  return (
    <div>
      <section className="relative overflow-hidden bg-brand-950">
        <SmartImage src={sectionImages.weaving.src} alt={sectionImages.weaving.alt} eager className="absolute inset-0 size-full object-cover opacity-40" />
        <div className="absolute inset-0 bg-gradient-to-r from-brand-950 via-brand-950/80 to-transparent" />
        <div className="container-page relative py-16 sm:py-24">
          <p className="text-xs font-semibold tracking-[0.3em] text-gold-300 uppercase">For manufacturers, wholesalers & distributors</p>
          <h1 className="mt-4 max-w-2xl font-serif text-4xl leading-tight font-semibold text-white sm:text-5xl">Take Your Garment Business Beyond Your Local Market</h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-white/85">
            Showcase your catalogue to retailers, boutiques and resellers. You keep ownership of your stock, set your own wholesale prices and MOQs, and ship directly to buyers.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            {cta}
            {user && user.role !== 'SUPPLIER' && <p className="text-sm text-white/80">You&apos;re signed in with a {user.role.toLowerCase()} account. Sign out to register a separate supplier account.</p>}
          </div>
        </div>
      </section>

      <section className="container-page py-14">
        <h2 className="section-title text-center">How supplier onboarding works</h2>
        <ol className="mt-10 grid gap-6 md:grid-cols-4">
          {[
            [UserPlus, 'Create your account', 'Register as a wholesaler, manufacturer or distributor.'],
            [FileCheck2, 'Add business details', 'Business address, categories you supply and GSTIN if registered.'],
            [ClipboardCheck, 'Upload documents', 'GST certificate, PAN or Udyam proof for our team to review. New suppliers start as “pending”.'],
            [Images, 'List your products', 'Once approved, add listings with your own photos, price and MOQ. Each listing is reviewed before going live.'],
          ].map(([Icon, title, body], i) => {
            const I = Icon as typeof UserPlus;
            return (
              <li key={title as string} className="rounded-xl border border-line bg-white p-5">
                <div className="flex items-center gap-3">
                  <span className="flex size-9 items-center justify-center rounded-full bg-brand-900 text-sm font-semibold text-white">{i + 1}</span>
                  <I className="size-6 stroke-[1.4] text-copper-600" aria-hidden />
                </div>
                <h3 className="mt-4 font-serif text-lg font-semibold">{title as string}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted">{body as string}</p>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="bg-ivory py-14">
        <div className="container-page grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {[
            [BadgeIndianRupee, 'Your prices', 'Set wholesale prices per piece, set, metre or pair.'],
            [Ruler, 'Your MOQ', 'Define minimum order quantities and order multiples per listing.'],
            [MessagesSquare, 'Direct enquiries', 'Retailers send bulk enquiries straight to your portal.'],
            [Truck, 'You fulfil', 'Confirm orders, then pack and ship directly to the retailer.'],
          ].map(([Icon, title, body]) => {
            const I = Icon as typeof Ruler;
            return (
              <div key={title as string} className="rounded-xl border border-line bg-white p-5">
                <I className="size-8 stroke-[1.3] text-copper-600" aria-hidden />
                <h3 className="mt-3 font-serif text-lg font-semibold">{title as string}</h3>
                <p className="mt-1 text-sm text-muted">{body as string}</p>
              </div>
            );
          })}
        </div>
        <div className="container-page mt-10 text-center">{cta}</div>
      </section>
    </div>
  );
}
