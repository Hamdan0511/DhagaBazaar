import { Link } from 'react-router-dom';
import { Mail, MapPin, Phone } from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import { BUSINESS } from '@/config/business';
import { useCategories } from '@/lib/categories';
import { categoryUrl } from '@/lib/utils';

function Col({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <h3 className="mb-4 font-serif text-base font-semibold text-brand-900">{title}</h3>
      <ul className="space-y-2.5 text-sm">
        {links.map(([label, to]) => (
          <li key={to + label}>
            <Link to={to} className="text-charcoal/80 transition-colors hover:text-copper-500">
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

const Placeholder = ({ children }: { children: string }) => <span className="text-muted italic">{children}</span>;

export function SiteFooter() {
  const cats = useCategories();
  return (
    <footer className="mt-auto border-t border-line bg-ivory pb-16 lg:pb-0 print:hidden">
      <div className="container-page grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr_1.3fr]">
        <div>
          <Logo variant="full" className="h-24" />
          <p className="mt-5 max-w-xs text-sm leading-relaxed text-muted">
            A B2B marketplace connecting garment manufacturers, wholesalers and distributors with retailers, boutiques and resellers across India.
          </p>
        </div>
        <Col title="Browse" links={[...cats.roots.map((r): [string, string] => [r.name, categoryUrl(r.path)]), ['All Categories', '/categories']]} />
        <Col
          title="Marketplace"
          links={[
            ['About Us', '/about'],
            ['How It Works', '/how-it-works'],
            ['Become a Supplier', '/become-a-supplier'],
            ['Supplier Directory', '/suppliers'],
            ['Image Credits', '/image-credits'],
          ]}
        />
        <Col
          title="Support"
          links={[
            ['Help Centre', '/help'],
            ['Contact', '/contact'],
            ['Terms and Conditions', '/terms'],
            ['Privacy Policy', '/privacy'],
            ['Return and Refund Policy', '/returns'],
          ]}
        />
        <div>
          <h3 className="mb-4 font-serif text-base font-semibold text-brand-900">Business Contact</h3>
          <ul className="space-y-3 text-sm">
            <li className="flex gap-2.5">
              <MapPin className="mt-0.5 size-4 shrink-0 text-copper-500" aria-hidden />
              {BUSINESS.address ?? <Placeholder>{`Registered address to be published · Launching in ${BUSINESS.launchCity}`}</Placeholder>}
            </li>
            <li className="flex gap-2.5">
              <Mail className="mt-0.5 size-4 shrink-0 text-copper-500" aria-hidden />
              {BUSINESS.email ? <a href={`mailto:${BUSINESS.email}`} className="hover:text-copper-500">{BUSINESS.email}</a> : <Placeholder>Business email to be published</Placeholder>}
            </li>
            <li className="flex gap-2.5">
              <Phone className="mt-0.5 size-4 shrink-0 text-copper-500" aria-hidden />
              {BUSINESS.phone ?? <Placeholder>Phone number to be published</Placeholder>}
            </li>
          </ul>
          <Link to="/contact" className="mt-5 inline-flex h-10 items-center rounded-md border border-brand-900/40 px-4 text-sm font-medium text-brand-900 hover:bg-brand-900 hover:text-white">
            Send us a message
          </Link>
        </div>
      </div>
      <div className="bg-brand-900 text-brand-100">
        <div className="container-page flex flex-col gap-2 py-4 text-xs sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Dhaaga Bazaar. India&apos;s B2B Garment Marketplace.</p>
          <p className="text-brand-100/75">Category photographs are illustrative and licensed from Unsplash. They are not supplier listings.</p>
        </div>
      </div>
    </footer>
  );
}
