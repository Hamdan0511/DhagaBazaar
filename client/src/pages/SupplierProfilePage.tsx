import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, Bookmark, MapPin, PackageOpen, Store } from 'lucide-react';
import { formatINR } from '@dhaaga/shared';
import { api, errorMessage } from '@/lib/api';
import type { ProductCardData } from '@/lib/types';
import { Breadcrumbs, EmptyState, ErrorState, FixtureBadge, PageLoader } from '@/components/ui/Feedback';
import { ProductCard } from '@/components/catalog/ProductCard';
import { Button, ButtonLink } from '@/components/ui/Button';
import { useCommerceAction, useSavedIds } from '@/hooks/useCommerce';
import { useCategories } from '@/lib/categories';
import { categoryUrl, titleCase } from '@/lib/utils';
import { Link } from 'react-router-dom';

interface PublicSupplier {
  id: string;
  businessName: string;
  businessType: string;
  description: string | null;
  city: string | null;
  state: string | null;
  isVerified: boolean;
  yearEstablished: number | null;
  categoryPaths: string[];
  minOrderValuePaise: number | null;
  isFixture: boolean;
  createdAt: string;
}

export default function SupplierProfilePage() {
  const { id = '' } = useParams();
  const cats = useCategories();
  const qc = useQueryClient();
  const saved = useSavedIds();
  const { run } = useCommerceAction();
  const q = useQuery({ queryKey: ['supplier', id], queryFn: () => api.get<{ supplier: PublicSupplier; products: ProductCardData[] }>(`/suppliers/${id}`) });
  const s = q.data?.supplier;
  useEffect(() => {
    if (s) document.title = `${s.businessName} · Supplier · Dhaaga Bazaar`;
  }, [s]);
  if (q.isLoading) return <PageLoader />;
  if (q.isError || !s) return <div className="container-page py-12"><ErrorState message={errorMessage(q.error)} /></div>;
  const isSaved = saved.data?.supplierIds.includes(s.id);

  return (
    <div className="container-page py-8">
      <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Suppliers', to: '/suppliers' }, { label: s.businessName }]} />
      <section className="mt-5 flex flex-col gap-5 rounded-2xl border border-line bg-white p-6 sm:flex-row sm:items-start">
        <div className="flex size-16 shrink-0 items-center justify-center rounded-xl bg-brand-100 font-serif text-2xl font-semibold text-brand-900">{s.businessName.replace(/^\[.*?\]\s*/, '').charAt(0)}</div>
        <div className="min-w-0 flex-1">
          {s.isFixture && <FixtureBadge className="mb-2" />}
          <h1 className="font-serif text-2xl font-semibold sm:text-3xl">{s.businessName}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            <span className="flex items-center gap-1">
              <Store className="size-4" aria-hidden /> {titleCase(s.businessType)}
            </span>
            {s.city && (
              <span className="flex items-center gap-1">
                <MapPin className="size-4" aria-hidden /> {s.city}
                {s.state ? `, ${s.state}` : ''}
              </span>
            )}
            {s.yearEstablished && <span>Established {s.yearEstablished}</span>}
            {s.isVerified && (
              <span className="flex items-center gap-1 text-success">
                <BadgeCheck className="size-4" aria-hidden /> Business documents verified by Dhaaga Bazaar
              </span>
            )}
          </p>
          {s.description && <p className="mt-3 max-w-3xl text-sm leading-relaxed whitespace-pre-line">{s.description}</p>}
          {s.minOrderValuePaise && <p className="mt-2 text-sm">Minimum order value: <span className="font-medium">{formatINR(s.minOrderValuePaise)}</span></p>}
          {s.categoryPaths.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {s.categoryPaths.map((p) => {
                const c = cats.get(p);
                return c ? (
                  <Link key={p} to={categoryUrl(p)} className="rounded-full border border-line-strong px-3 py-1 text-xs hover:border-copper-400">
                    {c.name}
                  </Link>
                ) : null;
              })}
            </div>
          )}
        </div>
        <Button
          variant={isSaved ? 'subtle' : 'outline'}
          icon={<Bookmark className={isSaved ? 'size-4 fill-copper-500 text-copper-500' : 'size-4'} />}
          onClick={async () => {
            if (isSaved) {
              await api.delete(`/retailer/saved/suppliers/${s.id}`);
              void qc.invalidateQueries({ queryKey: ['saved'] });
            } else run({ type: 'save.supplier', supplierId: s.id, supplierName: s.businessName }, 'Sign in to shortlist suppliers.');
          }}
        >
          {isSaved ? 'Shortlisted' : 'Shortlist supplier'}
        </Button>
      </section>
      <h2 className="mt-10 mb-4 font-serif text-2xl font-semibold">Catalogue</h2>
      {q.data!.products.length ? (
        <ul className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 xl:grid-cols-4">
          {q.data!.products.map((p) => (
            <li key={p.id}>
              <ProductCard product={p} />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={<PackageOpen className="size-7" />} title="No published listings yet" description="This supplier's catalogue will appear here once their listings are reviewed and published." actions={<ButtonLink to="/categories" variant="subtle">Explore other categories</ButtonLink>} />
      )}
    </div>
  );
}
