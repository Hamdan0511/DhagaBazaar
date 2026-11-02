import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useCategories } from '@/lib/categories';
import { getCategoryImage, PLACEHOLDER_IMAGE } from '@/lib/images';
import { categoryUrl } from '@/lib/utils';
import { Breadcrumbs, SmartImage } from '@/components/ui/Feedback';

export default function CategoriesIndexPage() {
  const cats = useCategories();
  useEffect(() => {
    document.title = 'All Categories · Dhaaga Bazaar';
  }, []);
  return (
    <div className="container-page py-8 sm:py-10">
      <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'All Categories' }]} />
      <h1 className="mt-4 font-serif text-3xl font-semibold sm:text-4xl">All Categories</h1>
      <p className="mt-2 max-w-2xl text-muted">Browse every garment category on Dhaaga Bazaar. Category photographs are illustrative; supplier listings appear inside each category.</p>
      <div className="mt-8 space-y-10">
        {cats.roots.map((root) => {
          const image = getCategoryImage(root.path) ?? PLACEHOLDER_IMAGE;
          const children = cats.children(root.path);
          return (
            <section key={root.path} className="grid gap-5 rounded-2xl border border-line bg-white p-4 sm:p-6 lg:grid-cols-[18rem_minmax(0,1fr)]" aria-labelledby={`cat-${root.slug}`}>
              <Link to={categoryUrl(root.path)} className="group relative block aspect-[16/10] overflow-hidden rounded-xl bg-brand-100 lg:aspect-auto lg:min-h-64">
                <SmartImage src={image.src} alt={`${image.alt} (illustrative)`} className="absolute inset-0 size-full object-cover object-top transition-transform duration-500 group-hover:scale-[1.04]" />
                <div className="absolute inset-0 bg-gradient-to-t from-brand-950/75 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-4 text-white">
                  <h2 id={`cat-${root.slug}`} className="font-serif text-2xl font-semibold text-white">
                    {root.name}
                  </h2>
                  <span className="mt-1 inline-flex items-center gap-1 text-sm">
                    View all <ArrowRight className="size-3.5" aria-hidden />
                  </span>
                </div>
              </Link>
              <div>
                <p className="text-sm text-muted">{root.description}</p>
                <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                  {children.map((c) => (
                    <li key={c.path}>
                      <Link to={categoryUrl(c.path)} className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2.5 text-sm text-charcoal transition-colors hover:border-copper-400 hover:bg-brand-50 hover:text-copper-600">
                        <span className="truncate">{c.name}</span>
                        {c.listingCount > 0 && <span className="shrink-0 rounded-full bg-brand-100 px-2 text-xs text-brand-800">{c.listingCount}</span>}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
