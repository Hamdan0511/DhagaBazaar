import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

/** Filter state lives in the URL so filtered pages are shareable and survive refresh. */
export function useListingParams() {
  const [params, setParams] = useSearchParams();

  const list = useCallback((key: string) => (params.get(key) ?? '').split(',').filter(Boolean), [params]);

  const update = useCallback(
    (mutate: (p: URLSearchParams) => void) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          mutate(next);
          next.delete('page'); // any filter change resets pagination
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const toggle = useCallback(
    (key: string, value: string) =>
      update((p) => {
        const cur = (p.get(key) ?? '').split(',').filter(Boolean);
        const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
        if (next.length) p.set(key, next.join(','));
        else p.delete(key);
      }),
    [update],
  );

  const set = useCallback((key: string, value: string | null) => update((p) => (value ? p.set(key, value) : p.delete(key))), [update]);

  const clearAll = useCallback(
    () =>
      setParams(
        (prev) => {
          const next = new URLSearchParams();
          const q = prev.get('q');
          const sort = prev.get('sort');
          if (q) next.set('q', q);
          if (sort) next.set('sort', sort);
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );

  const setPage = useCallback((page: number) => setParams((prev) => {
    const next = new URLSearchParams(prev);
    if (page > 1) next.set('page', String(page));
    else next.delete('page');
    return next;
  }), [setParams]);

  /** Query string forwarded to the API (filters only). */
  const apiQuery = useMemo(() => {
    const out = new URLSearchParams();
    for (const [k, v] of params.entries()) {
      if (k.startsWith('attr.') || ['moq', 'moqMin', 'moqMax', 'qty', 'priceMin', 'priceMax', 'priceUnit', 'city', 'supplier', 'sort', 'page', 'q'].includes(k)) out.set(k, v);
    }
    return out;
  }, [params]);

  const activeCount = useMemo(
    () => [...params.keys()].filter((k) => k.startsWith('attr.') || ['moq', 'moqMin', 'moqMax', 'qty', 'priceMin', 'priceMax', 'priceUnit', 'city', 'supplier'].includes(k)).length,
    [params],
  );

  return { params, list, toggle, set, update, clearAll, setPage, apiQuery, activeCount };
}

export type ListingParams = ReturnType<typeof useListingParams>;
