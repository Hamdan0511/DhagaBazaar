import { useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, PackageOpen, SearchX, SlidersHorizontal } from 'lucide-react';
import { SORT_OPTIONS, formatNumber, type FilterSetKey } from '@dhaaga/shared';
import { api, errorMessage } from '@/lib/api';
import type { ListingResponse } from '@/lib/types';
import { ProductCard } from './ProductCard';
import { ActiveFilterChips, FilterPanel } from './Filters';
import { useListingParams } from './useListingParams';
import { Drawer } from '@/components/ui/Overlay';
import { Button, ButtonLink } from '@/components/ui/Button';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback';
import { cn } from '@/lib/utils';

export function ListingView({ categoryPath, filterSet, scopeLabel, query }: { categoryPath?: string; filterSet: FilterSetKey | null; scopeLabel: string; query?: string }) {
  const lp = useListingParams();
  const [drawer, setDrawer] = useState(false);
  const qs = new URLSearchParams(lp.apiQuery);
  if (categoryPath) qs.set('category', categoryPath);
  if (query) qs.set('q', query);
  const listing = useQuery({
    queryKey: ['products', qs.toString()],
    queryFn: () => api.get<ListingResponse>(`/products?${qs.toString()}`),
    placeholderData: keepPreviousData,
  });
  const data = listing.data;
  const effectiveFilterSet = (filterSet ?? (data?.filterSet as FilterSetKey | null)) || null;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const sort = lp.params.get('sort') ?? 'newest';

  const panel = <FilterPanel filterSet={effectiveFilterSet} facets={data?.facets} lp={lp} />;

  return (
    <div className="grid gap-8 lg:grid-cols-[17rem_minmax(0,1fr)]">
      <aside className="hidden lg:block" aria-label="Filters">
        <div className="sticky top-[13.5rem] max-h-[calc(100vh-14.5rem)] overflow-y-auto rounded-xl border border-line bg-white px-5 py-4">{panel}</div>
      </aside>
      <Drawer
        open={drawer}
        onClose={() => setDrawer(false)}
        side="left"
        title="Filters"
        footer={
          <Button className="w-full" onClick={() => setDrawer(false)}>
            Show {data ? formatNumber(data.total) : ''} result{data?.total === 1 ? '' : 's'}
          </Button>
        }
      >
        <div className="px-5 py-2">{panel}</div>
      </Drawer>

      <div className="min-w-0">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <button onClick={() => setDrawer(true)} className="flex h-10 items-center gap-2 rounded-md border border-line-strong bg-white px-4 text-sm font-medium lg:hidden">
            <SlidersHorizontal className="size-4" aria-hidden /> Filters
            {lp.activeCount > 0 && <span className="rounded-full bg-copper-500 px-1.5 text-xs text-white">{lp.activeCount}</span>}
          </button>
          <p className="text-sm text-muted" aria-live="polite">
            {listing.isLoading ? 'Loading listings…' : data ? (data.facets.scopeTotal === 0 ? `No supplier listings in ${scopeLabel} yet` : `${formatNumber(data.total)} listing${data.total === 1 ? '' : 's'} in ${scopeLabel}`) : ''}
          </p>
          <label className="ml-auto flex items-center gap-2 text-sm">
            <span className="hidden text-muted sm:inline">Sort by</span>
            <select
              value={sort}
              onChange={(e) => lp.set('sort', e.target.value === 'newest' ? null : e.target.value)}
              disabled={!data || data.facets.scopeTotal === 0}
              className="h-10 rounded-md border border-line-strong bg-white px-3 text-sm focus:border-copper-500 focus:outline-none disabled:opacity-50"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mb-5">
          <ActiveFilterChips lp={lp} filterSet={effectiveFilterSet} facets={data?.facets} />
        </div>

        {listing.isError ? (
          <ErrorState message={errorMessage(listing.error)} onRetry={() => listing.refetch()} />
        ) : listing.isLoading ? (
          <div className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="overflow-hidden rounded-xl border border-line bg-white">
                <Skeleton className="aspect-[4/5] rounded-none" />
                <div className="space-y-2 p-3.5">
                  <Skeleton className="h-4 w-4/5" />
                  <Skeleton className="h-5 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : data && data.facets.scopeTotal === 0 ? (
          <EmptyState
            icon={<PackageOpen className="size-7" />}
            title={query ? 'No products match your search yet.' : 'No products available in this category yet.'}
            description={
              <>
                Supplier catalogues will appear here as we onboard our wholesale partners.
                {query ? ' Try a broader search or browse the categories below.' : ''}
              </>
            }
            actions={
              <>
                <ButtonLink to="/categories" variant="primary">
                  Explore Other Categories
                </ButtonLink>
                <ButtonLink to="/become-a-supplier" variant="subtle">
                  Supply this category
                </ButtonLink>
              </>
            }
          />
        ) : data && data.total === 0 ? (
          <EmptyState
            icon={<SearchX className="size-7" />}
            title="No listings match these filters"
            description="Try removing a filter or widening your MOQ or price range."
            actions={
              <Button variant="primary" onClick={lp.clearAll}>
                Clear all filters
              </Button>
            }
          />
        ) : data ? (
          <>
            <ul className={cn('grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 xl:grid-cols-4', listing.isFetching && 'opacity-60 transition-opacity')}>
              {data.items.map((p) => (
                <li key={p.id}>
                  <ProductCard product={p} />
                </li>
              ))}
            </ul>
            {totalPages > 1 && (
              <nav className="mt-8 flex items-center justify-center gap-2" aria-label="Pagination">
                <Button variant="subtle" size="sm" disabled={data.page <= 1} onClick={() => lp.setPage(data.page - 1)} icon={<ChevronLeft className="size-4" />}>
                  Previous
                </Button>
                <span className="px-3 text-sm text-muted">
                  Page {data.page} of {totalPages}
                </span>
                <Button variant="subtle" size="sm" disabled={data.page >= totalPages} onClick={() => lp.setPage(data.page + 1)}>
                  Next <ChevronRight className="size-4" />
                </Button>
              </nav>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
