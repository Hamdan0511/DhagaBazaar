import { useEffect } from 'react';
import { Link, NavLink, useParams } from 'react-router-dom';
import type { FilterSetKey } from '@dhaaga/shared';
import { useCategories } from '@/lib/categories';
import { categoryGallery, getCategoryImage } from '@/lib/images';
import { categoryUrl, cn } from '@/lib/utils';
import { Breadcrumbs, SmartImage } from '@/components/ui/Feedback';
import { ListingView } from '@/components/catalog/ListingView';
import { useRecent } from '@/stores/recent';
import NotFoundPage from './NotFoundPage';

export default function CategoryPage() {
  const path = (useParams()['*'] ?? '').replace(/\/+$/, '');
  const cats = useCategories();
  const category = cats.get(path);
  const addRecent = useRecent((s) => s.addCategory);

  useEffect(() => {
    if (category) {
      document.title = `${category.title} · Dhaaga Bazaar`;
      addRecent(category.path);
    }
  }, [category, addRecent]);

  if (!category) {
    if (cats.isFetching) return null;
    return <NotFoundPage title="Category not found" message="This category doesn't exist or is no longer active." />;
  }

  const parent = category.parentPath ? cats.get(category.parentPath) : undefined;
  const children = cats.children(category.path);
  const siblings = parent ? cats.children(parent.path) : [];
  // Only show photos that genuinely represent this category (its own, plus its subcategories' on parent pages).
  const ownImage = getCategoryImage(category.path);
  const arches = [ownImage, ...(categoryGallery[category.path] ?? []), ...children.map((c) => getCategoryImage(c.path))].filter((x): x is NonNullable<typeof x> => !!x).slice(0, 3);
  const trail = [{ label: 'Home', to: '/' }, ...(parent ? [{ label: parent.name, to: categoryUrl(parent.path) }] : []), { label: category.name }];

  return (
    <div>
      {/* Category banner */}
      <section className="relative overflow-hidden border-b border-line bg-textile">
        <div className="container-page relative grid items-center gap-6 py-7 md:grid-cols-[minmax(0,1fr)_auto] md:py-0">
          <div className="md:py-10">
            <Breadcrumbs items={trail} />
            <h1 className="mt-4 font-serif text-[2rem] leading-tight font-semibold sm:text-[2.6rem]">{category.title}</h1>
            <p className="mt-2 max-w-xl text-[0.9375rem] leading-relaxed text-charcoal/80 sm:text-base">{category.description}</p>
            {category.listingCount > 0 && (
              <p className="mt-3 text-sm font-medium text-copper-600">
                {category.listingCount} live supplier listing{category.listingCount === 1 ? '' : 's'}
              </p>
            )}
          </div>
          {arches.length > 0 && (
            <figure className="flex flex-col items-center gap-2 pb-2 md:items-end md:py-8">
              {/* Arched frames echo Indian architecture and show the garment in portrait. */}
              <div className="flex items-end gap-3 sm:gap-4">
                {arches.map((a, i) => (
                  <div
                    key={a.src}
                    className={cn(
                      'relative overflow-hidden rounded-t-[999px] border-[3px] border-white bg-brand-100 shadow-[var(--shadow-lift)] ring-1 ring-gold-400/50',
                      i === 0 ? 'h-56 w-40 sm:h-64 sm:w-48 lg:h-72 lg:w-52' : 'hidden h-48 w-32 sm:block lg:h-56 lg:w-40',
                    )}
                  >
                    <SmartImage src={a.src} alt={`${a.alt} — illustrative category image`} eager={i === 0} className="absolute inset-0 size-full object-cover object-top" />
                  </div>
                ))}
              </div>
              <figcaption className="text-[0.6875rem] text-muted">Illustrative category imagery — not available for purchase</figcaption>
            </figure>
          )}
        </div>
      </section>

      <div className="container-page py-8">
        {/* Subcategory navigation */}
        {children.length > 0 && (
          <nav aria-label={`${category.name} subcategories`} className="mb-8">
            <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted uppercase">Shop {category.name} by type</h2>
            <ul className="scrollbar-none -mx-4 flex gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-4 sm:px-0 md:grid-cols-6 xl:grid-cols-8">
              {children.map((c) => {
                const img = getCategoryImage(c.path);
                return (
                  <li key={c.path} className="w-28 shrink-0 sm:w-auto">
                    <Link to={categoryUrl(c.path)} className="group block text-center">
                      <div className="relative mx-auto aspect-square overflow-hidden rounded-full border border-line bg-brand-100">
                        {img ? (
                          <SmartImage src={img.src} alt="" className="absolute inset-0 size-full object-cover object-top transition-transform duration-500 group-hover:scale-110" />
                        ) : (
                          <span className="absolute inset-0 flex items-center justify-center font-serif text-2xl text-copper-500">{c.name.charAt(0)}</span>
                        )}
                      </div>
                      <span className="mt-2 block text-[0.8125rem] leading-tight font-medium text-charcoal group-hover:text-copper-600">{c.name}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        )}
        {siblings.length > 0 && (
          <nav aria-label={`More in ${parent!.name}`} className="scrollbar-none -mx-4 mb-7 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
            <Link to={categoryUrl(parent!.path)} className="shrink-0 rounded-full border border-line-strong bg-white px-3.5 py-1.5 text-[0.8125rem] font-medium text-charcoal hover:border-copper-400">
              All {parent!.name}
            </Link>
            {siblings.map((s) => (
              <NavLink
                key={s.path}
                to={categoryUrl(s.path)}
                className={({ isActive }) => cn('shrink-0 rounded-full border px-3.5 py-1.5 text-[0.8125rem] font-medium whitespace-nowrap', isActive ? 'border-copper-500 bg-copper-500 text-white' : 'border-line-strong bg-white text-charcoal hover:border-copper-400')}
              >
                {s.name}
              </NavLink>
            ))}
          </nav>
        )}

        <ListingView key={category.path} categoryPath={category.path} filterSet={category.filterSet as FilterSetKey} scopeLabel={category.name} />
      </div>
    </div>
  );
}
