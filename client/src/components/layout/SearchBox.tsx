import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Clock, Folder, Search, Shirt, Store, X } from 'lucide-react';
import { searchTaxonomy } from '@dhaaga/shared';
import { api } from '@/lib/api';
import { useRecent } from '@/stores/recent';
import { categoryUrl, cn } from '@/lib/utils';

interface Suggestion {
  kind: 'recent' | 'category' | 'supplier' | 'product' | 'query';
  label: string;
  sub?: string;
  to: string;
}

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function SearchBox({ className, compact = false }: { className?: string; compact?: boolean }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const urlQuery = location.pathname === '/search' ? params.get('q') ?? '' : '';
  const [value, setValue] = useState(urlQuery);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const wrap = useRef<HTMLDivElement>(null);
  const listId = useId();
  const { searches, addSearch, removeSearch, clearSearches } = useRecent();

  // Search query persistence: keep the box in sync with /search?q=
  useEffect(() => { setValue(urlQuery); }, [urlQuery]);

  const debounced = useDebounced(value.trim(), 200);
  const remote = useQuery({
    queryKey: ['suggest', debounced],
    queryFn: () =>
      api.get<{ suppliers: { id: string; businessName: string; city: string | null }[]; products: { id: string; title: string; category: { name: string } }[] }>(
        `/search/suggest?q=${encodeURIComponent(debounced)}`,
      ),
    enabled: debounced.length >= 2,
    staleTime: 60_000,
  });

  const suggestions = useMemo<Suggestion[]>(() => {
    const q = value.trim();
    if (!q) return searches.map((s) => ({ kind: 'recent', label: s, to: `/search?q=${encodeURIComponent(s)}` }));
    const items: Suggestion[] = searchTaxonomy(q, 6).map((c) => ({
      kind: 'category',
      label: c.name,
      sub: c.parentName ? `in ${c.parentName}` : 'Category',
      to: categoryUrl(c.path),
    }));
    for (const p of remote.data?.products ?? []) items.push({ kind: 'product', label: p.title, sub: p.category.name, to: `/products/${p.id}` });
    for (const s of remote.data?.suppliers ?? []) items.push({ kind: 'supplier', label: s.businessName, sub: s.city ?? 'Supplier', to: `/suppliers/${s.id}` });
    items.push({ kind: 'query', label: `Search for “${q}”`, to: `/search?q=${encodeURIComponent(q)}` });
    return items;
  }, [value, searches, remote.data]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);
  useEffect(() => { setActive(-1); }, [value]);

  const go = (s: Suggestion) => {
    if (s.kind === 'recent' || s.kind === 'query') addSearch(s.kind === 'recent' ? s.label : value.trim());
    setOpen(false);
    navigate(s.to);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (active >= 0 && suggestions[active]) return go(suggestions[active]);
    const q = value.trim();
    if (!q) return;
    addSearch(q);
    setOpen(false);
    navigate(`/search?q=${encodeURIComponent(q)}`);
  };

  const icon = (k: Suggestion['kind']) =>
    k === 'recent' ? <Clock className="size-4" /> : k === 'category' ? <Folder className="size-4" /> : k === 'supplier' ? <Store className="size-4" /> : k === 'product' ? <Shirt className="size-4" /> : <Search className="size-4" />;

  return (
    <div ref={wrap} className={cn('relative w-full', className)}>
      <form onSubmit={submit} role="search" className="flex">
        <label htmlFor={`${listId}-input`} className="sr-only">
          Search Dhaaga Bazaar
        </label>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-4 size-[1.15rem] -translate-y-1/2 text-brand-900/70" aria-hidden />
          <input
            id={`${listId}-input`}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setOpen(true);
                setActive((a) => Math.min(a + 1, suggestions.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, -1));
              } else if (e.key === 'Escape') setOpen(false);
            }}
            type="search"
            autoComplete="off"
            enterKeyHint="search"
            placeholder="Search for sarees, kurtis, fabrics, suppliers..."
            role="combobox"
            aria-expanded={open && suggestions.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
            className={cn(
              'w-full rounded-l-full border border-r-0 border-line-strong bg-white pr-3 pl-11 text-[0.9375rem] text-charcoal placeholder:text-muted/80 focus:border-copper-500 focus:outline-none [&::-webkit-search-cancel-button]:hidden',
              compact ? 'h-11' : 'h-[3.125rem]',
            )}
          />
        </div>
        <button
          type="submit"
          className={cn('rounded-r-full bg-copper-500 px-5 font-medium text-white transition-colors hover:bg-copper-600 sm:px-7', compact ? 'h-11 text-sm' : 'h-[3.125rem] text-[0.9375rem]')}
        >
          <span className="hidden sm:inline">Search</span>
          <Search className="size-5 sm:hidden" aria-label="Search" />
        </button>
      </form>

      {open && suggestions.length > 0 && (
        <div className="absolute top-full right-0 left-0 z-50 mt-2 overflow-hidden rounded-xl border border-line bg-white shadow-[var(--shadow-lift)]">
          {!value.trim() && (
            <div className="flex items-center justify-between px-4 pt-3 pb-1 text-xs font-semibold tracking-wide text-muted uppercase">
              Recent searches
              <button onClick={clearSearches} className="font-medium tracking-normal text-copper-500 normal-case hover:underline">
                Clear
              </button>
            </div>
          )}
          <ul id={listId} role="listbox" className="max-h-[60vh] overflow-y-auto py-1">
            {suggestions.map((s, i) => (
              <li key={`${s.kind}-${s.to}`} id={`${listId}-${i}`} role="option" aria-selected={i === active} className="group flex items-center">
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(s)}
                  className={cn('flex flex-1 items-center gap-3 px-4 py-2.5 text-left text-sm', i === active ? 'bg-brand-50' : 'hover:bg-brand-50')}
                >
                  <span className="text-muted">{icon(s.kind)}</span>
                  <span className="min-w-0 flex-1 truncate text-charcoal">{s.label}</span>
                  {s.sub && <span className="shrink-0 text-xs text-muted">{s.sub}</span>}
                </button>
                {s.kind === 'recent' && (
                  <button type="button" onClick={() => removeSearch(s.label)} className="mr-2 rounded p-1.5 text-muted hover:bg-brand-100" aria-label={`Remove ${s.label} from recent searches`}>
                    <X className="size-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
          {value.trim() && <p className="border-t border-line px-4 py-2 text-xs text-muted">Suggestions come from our category list and live supplier listings only.</p>}
        </div>
      )}
    </div>
  );
}
