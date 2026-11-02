import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BadgeCheck, MapPin, Store, Users } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { Breadcrumbs, EmptyState, ErrorState, FixtureBadge, PageLoader } from '@/components/ui/Feedback';
import { ButtonLink } from '@/components/ui/Button';
import { Select } from '@/components/ui/Field';
import { useCategories } from '@/lib/categories';
import { titleCase } from '@/lib/utils';

interface Row {
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

export default function SuppliersDirectoryPage() {
  const [params, setParams] = useSearchParams();
  const category = params.get('category') ?? '';
  const cats = useCategories();
  const q = useQuery({ queryKey: ['suppliers', category], queryFn: () => api.get<{ suppliers: Row[] }>(`/suppliers${category ? `?category=${encodeURIComponent(category)}` : ''}`) });
  useEffect(() => {
    document.title = 'Supplier Directory · Dhaaga Bazaar';
  }, []);
  return (
    <div className="container-page py-8">
      <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Suppliers' }]} />
      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-serif text-3xl font-semibold">Supplier Directory</h1>
          <p className="mt-1 text-sm text-muted">Approved manufacturers, wholesalers and distributors on Dhaaga Bazaar.</p>
        </div>
        <Select
          aria-label="Filter by category"
          value={category}
          onChange={(e) => setParams(e.target.value ? { category: e.target.value } : {})}
          wrapClassName="sm:w-72"
        >
          <option value="">All categories</option>
          {cats.list.map((c) => (
            <option key={c.path} value={c.path}>
              {c.depth ? '— ' : ''}
              {c.name}
            </option>
          ))}
        </Select>
      </div>
      <div className="mt-6">
        {q.isLoading ? (
          <PageLoader />
        ) : q.isError ? (
          <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
        ) : q.data!.suppliers.length === 0 ? (
          <EmptyState
            icon={<Users className="size-7" />}
            title="No suppliers are currently listed."
            description="Approved supplier profiles will be listed here. Are you a manufacturer or wholesaler? Join Dhaaga Bazaar as a launch partner."
            actions={<ButtonLink to="/become-a-supplier">Become a Supplier</ButtonLink>}
          />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {q.data!.suppliers.map((s) => (
              <li key={s.id}>
                <Link to={`/suppliers/${s.id}`} className="block h-full rounded-xl border border-line bg-white p-5 transition-shadow hover:shadow-[var(--shadow-lift)]">
                  {s.isFixture && <FixtureBadge className="mb-2" />}
                  <div className="flex items-center gap-2 font-serif text-lg font-semibold text-brand-900">
                    {s.businessName}
                    {s.isVerified && <BadgeCheck className="size-4 text-success" aria-label="Documents verified" />}
                  </div>
                  <p className="mt-1 flex flex-wrap gap-x-3 text-sm text-muted">
                    <span className="flex items-center gap-1">
                      <Store className="size-3.5" aria-hidden />
                      {titleCase(s.businessType)}
                    </span>
                    {s.city && (
                      <span className="flex items-center gap-1">
                        <MapPin className="size-3.5" aria-hidden />
                        {s.city}
                      </span>
                    )}
                  </p>
                  <p className="mt-3 text-sm">{s._count.products} published listing{s._count.products === 1 ? '' : 's'}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
