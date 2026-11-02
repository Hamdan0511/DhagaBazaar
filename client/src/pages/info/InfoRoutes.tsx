import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ChevronDown, ExternalLink } from 'lucide-react';
import { contactSchema } from '@dhaaga/shared';
import { Alert, Breadcrumbs } from '@/components/ui/Feedback';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Field';
import { api, errorMessage } from '@/lib/api';
import { imageCredits } from '@/lib/images';
import { BUSINESS } from '@/config/business';
import { HowItWorks } from '@/components/home/Sections';
import { cn } from '@/lib/utils';

function InfoPage({ title, intro, children, wide = false }: { title: string; intro?: ReactNode; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    document.title = `${title} · Dhaaga Bazaar`;
  }, [title]);
  return (
    <div className="container-page py-8 sm:py-10">
      <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: title }]} />
      <div className={cn('mt-4', wide ? 'max-w-5xl' : 'max-w-3xl')}>
        <h1 className="font-serif text-3xl font-semibold sm:text-4xl">{title}</h1>
        {intro && <div className="mt-3 text-lg leading-relaxed text-muted">{intro}</div>}
        <div className="prose-db mt-8 space-y-5 text-[0.9375rem] leading-relaxed text-charcoal/90 [&_h2]:mt-8 [&_h2]:font-serif [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-brand-900 [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1.5">
          {children}
        </div>
      </div>
    </div>
  );
}

const DraftNotice = () => (
  <Alert tone="warning" title="Working draft">
    This policy describes how the marketplace is designed to operate. It will be reviewed by legal counsel and finalised, with the registered business details, before commercial launch.
  </Alert>
);

function About() {
  return (
    <InfoPage title="About Dhaaga Bazaar" intro="Dhaaga (धागा) means thread — the thread that connects India's garment makers with the retailers who bring their work to customers.">
      <p>
        Dhaaga Bazaar is a B2B garment marketplace launching in {BUSINESS.launchCity}. We help independent clothing retailers, boutique owners and resellers discover wholesale collections and connect with garment manufacturers, wholesalers and distributors.
      </p>
      <h2>A zero-inventory marketplace</h2>
      <p>We don&apos;t buy or stock garments. Suppliers own their products, set their own wholesale prices and minimum order quantities, and pack and ship directly to retailers. Dhaaga Bazaar provides product discovery, bulk ordering, supplier connections and order coordination.</p>
      <h2>Every category, women&apos;s wear first</h2>
      <p>The marketplace supports women&apos;s, men&apos;s and kids&apos; wear, footwear, fabrics and accessories from day one. Our first supplier partnerships focus on women&apos;s wear — sarees, kurtis, suits, dupattas and more — while the other categories grow alongside.</p>
      <h2>Honest by design</h2>
      <ul>
        <li>Category photographs on the site are licensed, illustrative images — not supplier stock.</li>
        <li>Products, prices and supplier details shown in listings come only from approved suppliers.</li>
        <li>“Verified” marks appear only after our team has reviewed a supplier&apos;s business documents.</li>
      </ul>
      <div className="flex flex-wrap gap-3 pt-4">
        <ButtonLink to="/categories">Explore collections</ButtonLink>
        <ButtonLink to="/become-a-supplier" variant="subtle">
          Become a supplier
        </ButtonLink>
      </div>
    </InfoPage>
  );
}

function HowItWorksPage() {
  const { hash } = useLocation();
  useEffect(() => {
    document.title = 'How It Works · Dhaaga Bazaar';
    if (hash) document.querySelector(hash)?.scrollIntoView();
  }, [hash]);
  return (
    <div>
      <HowItWorks headingLevel="h1" />
      <div className="container-page grid gap-6 pb-14 md:grid-cols-2">
        <section className="rounded-xl border border-line bg-white p-6" id="retailers">
          <h2 className="font-serif text-xl font-semibold">For retailers</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted">
            <li>Browse freely — no account needed to explore categories, listings and supplier profiles.</li>
            <li>Create a free retailer account when you&apos;re ready to add to cart, save products or send enquiries.</li>
            <li>Each listing shows its MOQ. The cart checks MOQ across all sizes and colours of a product.</li>
            <li>Your cart is split into supplier groups. Submitting creates one order request per supplier.</li>
            <li>Suppliers confirm or decline, then add dispatch details you can track from your account.</li>
            <li>Payment terms are agreed with the supplier; Dhaaga Bazaar does not collect payment at this stage.</li>
          </ul>
        </section>
        <section className="rounded-xl border border-line bg-white p-6" id="suppliers">
          <h2 className="font-serif text-xl font-semibold">For suppliers</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted">
            <li>Register and complete your business profile, then upload verification documents.</li>
            <li>Your account stays “pending” until our team reviews and approves it — nothing is automatic.</li>
            <li>Approved suppliers submit listings with original photos, price, MOQ, sizes and colours for review.</li>
            <li>Receive enquiries and order requests in your portal; confirm, process and add dispatch details.</li>
            <li>You remain responsible for product quality, packing and shipping.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}

const FAQ: [string, string][] = [
  ['Do I need an account to browse?', 'No. Anyone can browse categories, listings and supplier profiles. You only need an account to add products to your cart, submit order requests, save products or send enquiries.'],
  ['What is MOQ?', 'MOQ means Minimum Order Quantity — the smallest quantity a supplier accepts for a listing. On Dhaaga Bazaar the MOQ applies to the total of a product across all its sizes and colours.'],
  ['Why are there no products in some categories yet?', 'We are onboarding our first wholesale partners. Listings appear only after a supplier is approved and each listing is reviewed. Category photos are illustrative and are not products for sale.'],
  ['How do orders work?', 'When you submit your cart, each supplier receives its own order request. Suppliers confirm availability and dispatch directly to you. You can follow each supplier group from My Orders.'],
  ['How do I pay?', 'Payment terms are currently agreed directly with each supplier after they confirm your order. Online payments will be introduced later.'],
  ['What does “Documents verified” mean?', 'It means our team has reviewed and accepted the supplier’s business documents (such as a GST certificate). It is not a guarantee of product quality or delivery.'],
  ['How do I become a supplier?', 'Create a supplier account from the Become a Supplier page, complete your business profile and upload documents. Our team reviews every application.'],
  ['How do I raise a complaint or return?', 'From My Account → Complaints & Returns, you can raise an issue against an order. Our team will coordinate with the supplier.'],
];

function Help() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <InfoPage title="Help Centre" intro="Answers to common questions about buying and selling on Dhaaga Bazaar.">
      <ul className="divide-y divide-line rounded-xl border border-line bg-white">
        {FAQ.map(([q, a], i) => (
          <li key={q} className="!ml-0 !list-none">
            <button onClick={() => setOpen(open === i ? null : i)} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left font-medium" aria-expanded={open === i}>
              {q}
              <ChevronDown className={cn('size-5 shrink-0 text-muted transition-transform', open === i && 'rotate-180')} aria-hidden />
            </button>
            {open === i && <p className="px-5 pb-4 text-sm text-muted">{a}</p>}
          </li>
        ))}
      </ul>
      <p>
        Still need help?{' '}
        <Link to="/contact" className="link">
          Contact our team
        </Link>
        .
      </p>
    </InfoPage>
  );
}

function Contact() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<z.infer<typeof contactSchema>>({ resolver: zodResolver(contactSchema), defaultValues: { topic: 'GENERAL' } });
  const e = form.formState.errors;
  return (
    <InfoPage title="Contact Us" intro="Questions about sourcing, supplying or your account? Send us a message and our team will get back to you.">
      {sent ? (
        <Alert tone="success" title="Message received">
          Thank you — our team will reply to the email address you provided.
        </Alert>
      ) : (
        <form
          className="space-y-4 rounded-xl border border-line bg-white p-6"
          noValidate
          onSubmit={form.handleSubmit(async (v) => {
            setError(null);
            try {
              await api.post('/contact', v);
              setSent(true);
            } catch (err) {
              setError(errorMessage(err));
            }
          })}
        >
          {error && <Alert tone="danger">{error}</Alert>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Your name" required error={e.name?.message} {...form.register('name')} />
            <Input label="Email" type="email" required error={e.email?.message} {...form.register('email')} />
            <Input label="Mobile (optional)" type="tel" error={e.phone?.message} {...form.register('phone')} />
            <Select label="Topic" {...form.register('topic')}>
              <option value="GENERAL">General enquiry</option>
              <option value="RETAILER">Buying as a retailer</option>
              <option value="SUPPLIER">Becoming a supplier</option>
              <option value="ORDER">An existing order</option>
              <option value="TECHNICAL">Technical issue</option>
            </Select>
          </div>
          <Textarea label="Message" required error={e.message?.message} {...form.register('message')} />
          <Button type="submit" loading={form.formState.isSubmitting}>
            Send message
          </Button>
        </form>
      )}
      <p className="text-sm text-muted">
        Business email, phone and registered address will be published here once finalised. Launching in {BUSINESS.launchCity}.
      </p>
    </InfoPage>
  );
}

function Terms() {
  return (
    <InfoPage title="Terms and Conditions">
      <DraftNotice />
      <h2>1. The marketplace</h2>
      <p>Dhaaga Bazaar is an online B2B marketplace that connects business buyers (retailers, boutique owners and resellers) with garment suppliers (manufacturers, wholesalers and distributors). Dhaaga Bazaar does not own, stock or sell the products listed by suppliers.</p>
      <h2>2. Accounts</h2>
      <ul>
        <li>Accounts are for businesses. You must provide accurate business and contact information.</li>
        <li>Supplier accounts are subject to review and approval. Approval or a “documents verified” mark is not a guarantee of product quality.</li>
        <li>You are responsible for keeping your login credentials secure.</li>
      </ul>
      <h2>3. Listings and orders</h2>
      <ul>
        <li>Suppliers are responsible for the accuracy of their listings, prices, MOQ and photographs, and must hold the rights to images they upload.</li>
        <li>An order submitted by a retailer is a request. A contract of sale is formed between the retailer and the supplier when the supplier confirms the order.</li>
        <li>Suppliers pack and ship directly to retailers and are responsible for fulfilment.</li>
      </ul>
      <h2>4. Prohibited conduct</h2>
      <p>Counterfeit goods, misleading listings, use of others&apos; photographs without permission, and attempts to circumvent platform safeguards are prohibited and may lead to suspension.</p>
      <h2>5. Liability</h2>
      <p>To the extent permitted by law, Dhaaga Bazaar facilitates transactions between independent businesses and is not a party to the sale contract. Final terms will be set out here before launch.</p>
    </InfoPage>
  );
}

function Privacy() {
  return (
    <InfoPage title="Privacy Policy">
      <DraftNotice />
      <h2>What we collect</h2>
      <ul>
        <li>Account details: name, email, mobile number, business name, business type and city.</li>
        <li>Supplier onboarding details and the verification documents you upload.</li>
        <li>Order requests, enquiries, saved items and delivery addresses you create.</li>
        <li>On your device only: recent searches and recently viewed items (browser local storage).</li>
      </ul>
      <h2>How we use it</h2>
      <p>To operate your account, connect retailers and suppliers, process order requests, review supplier applications, prevent fraud and comply with law. Suppliers receive the business and delivery details needed to fulfil orders you send them.</p>
      <h2>Security</h2>
      <p>Passwords are stored as salted hashes. Sessions use secure, HTTP-only cookies. Verification documents are stored privately and are accessible only to our review team.</p>
      <h2>Your choices</h2>
      <p>You can update your profile at any time and contact us to request access to or deletion of your data, subject to legal record-keeping obligations. This policy will be aligned with the Digital Personal Data Protection Act, 2023 before launch.</p>
    </InfoPage>
  );
}

function Returns() {
  return (
    <InfoPage title="Return and Refund Policy">
      <DraftNotice />
      <p>Because suppliers sell and ship directly to retailers, returns and refunds are handled between the retailer and the supplier, with Dhaaga Bazaar helping to coordinate.</p>
      <h2>Raising an issue</h2>
      <ul>
        <li>Inspect deliveries on arrival. Report damaged, defective, short or wrong items as soon as possible from My Account → Complaints & Returns, referencing the order.</li>
        <li>Include photos of the packaging and products where relevant.</li>
      </ul>
      <h2>Resolution</h2>
      <ul>
        <li>Our team reviews the complaint with the supplier and records the outcome.</li>
        <li>Remedies such as replacement, credit or refund depend on the supplier&apos;s terms agreed with you at confirmation.</li>
        <li>Custom, made-to-order or unstitched cut fabric items may not be returnable unless defective.</li>
      </ul>
    </InfoPage>
  );
}

function ImageCredits() {
  return (
    <InfoPage title="Image Credits" wide intro="Category photographs on Dhaaga Bazaar are illustrative images used under the Unsplash License. They show what each category represents — they are not supplier listings or products for sale.">
      <ul className="!ml-0 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {imageCredits.map((c) => (
          <li key={c.key} className="!ml-0 flex !list-none gap-3 rounded-lg border border-line bg-white p-2.5">
            <img src={c.src} alt="" loading="lazy" className="size-16 shrink-0 rounded object-cover" />
            <div className="min-w-0 text-xs">
              <div className="line-clamp-2 font-medium text-charcoal">{c.alt}</div>
              <a href={c.url} target="_blank" rel="noreferrer noopener" className="mt-1 inline-flex items-center gap-1 text-copper-600 hover:underline">
                Photo by {c.photographer} on Unsplash <ExternalLink className="size-3" aria-hidden />
              </a>
              {'note' in c && <div className="mt-1 text-muted">{(c as { note?: string }).note}</div>}
            </div>
          </li>
        ))}
      </ul>
      <p className="text-sm text-muted">The Dhaaga Bazaar logo is the property of Dhaaga Bazaar.</p>
    </InfoPage>
  );
}

const ROUTES: Record<string, () => ReactNode> = {
  '/about': About,
  '/how-it-works': HowItWorksPage,
  '/help': Help,
  '/contact': Contact,
  '/terms': Terms,
  '/privacy': Privacy,
  '/returns': Returns,
  '/image-credits': ImageCredits,
};

export default function InfoRoutes({ fallback }: { fallback: ReactNode }) {
  const { pathname } = useLocation();
  const Page = ROUTES[pathname.replace(/\/+$/, '') || '/'];
  return Page ? <Page /> : <>{fallback}</>;
}
