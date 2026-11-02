import { useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Folder } from 'lucide-react';
import { searchTaxonomy } from '@dhaaga/shared';
import { Breadcrumbs, EmptyState } from '@/components/ui/Feedback';
import { ListingView } from '@/components/catalog/ListingView';
import { categoryUrl } from '@/lib/utils';
import { useRecent } from '@/stores/recent';
import { ButtonLink } from '@/components/ui/Button';
import { CategoryTile } from '@/components/home/Sections';

export default function SearchPage() {
  const [params] = useSearchParams();
  const q = (params.get('q') ?? '').trim();
  const addSearch = useRecent((s) => s.addSearch);
  const matches = useMemo(() => searchTaxonomy(q, 12), [q]);

  useEffect(() => {
    document.title = q ? `“${q}” · Search · Dhaaga Bazaar` : 'Search · Dhaaga Bazaar';
    if (q) addSearch(q);
  }, [q, addSearch]);

  return (
    <div className="container-page py-8">
      <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Search' }]} />
      <h1 className="mt-4 font-serif text-3xl font-semibold">{q ? <>Results for “{q}”</> : 'Search the marketplace'}</h1>
      {!q ? (
        <EmptyState className="mt-8" title="What are you sourcing today?" description="Search for sarees, kurtis, shirts, kidswear, footwear, fabrics or a supplier name." actions={<ButtonLink to="/categories">Browse all categories</ButtonLink>} />
      ) : (
        <>
          {matches.length > 0 && (
            <section className="mt-6" aria-labelledby="matching-categories">
              <h2 id="matching-categories" className="mb-3 text-sm font-semibold tracking-wide text-muted uppercase">
                Matching categories
              </h2>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                {matches.slice(0, 6).map((m) => (
                  <li key={m.path}>
                    <CategoryTile path={m.path} name={m.name} blurb={m.parentName ?? undefined} aspect="aspect-[4/3]" />
                  </li>
                ))}
              </ul>
              {matches.length > 6 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {matches.slice(6).map((m) => (
                    <Link key={m.path} to={categoryUrl(m.path)} className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-white px-3 py-1.5 text-sm hover:border-copper-400">
                      <Folder className="size-3.5 text-muted" aria-hidden />
                      {m.name}
                      {m.parentName && <span className="text-xs text-muted">· {m.parentName}</span>}
                    </Link>
                  ))}
                </div>
              )}
            </section>
          )}
          <section className="mt-10" aria-labelledby="matching-listings">
            <h2 id="matching-listings" className="mb-4 font-serif text-2xl font-semibold">
              Supplier listings
            </h2>
            <ListingView key={q} query={q} filterSet={null} scopeLabel={`“${q}”`} />
          </section>
        </>
      )}
    </div>
  );
}
