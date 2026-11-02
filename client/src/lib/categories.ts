import { useQuery } from '@tanstack/react-query';
import { FLAT_CATEGORIES, type FilterSetKey } from '@dhaaga/shared';
import { api } from './api';

export interface CategoryInfo {
  path: string;
  slug: string;
  name: string;
  title: string;
  description: string;
  filterSet: FilterSetKey;
  depth: number;
  parentPath: string | null;
  /** Genuine number of approved listings (0 until suppliers publish). */
  listingCount: number;
  blurb?: string;
}

/** Static taxonomy used instantly (and as a fallback if the API is unreachable). */
const STATIC: CategoryInfo[] = FLAT_CATEGORIES.map((c) => ({
  path: c.path,
  slug: c.slug,
  name: c.name,
  title: c.title ?? `Wholesale ${c.name}`,
  description: c.description,
  filterSet: c.filterSet,
  depth: c.depth,
  parentPath: c.parentPath,
  listingCount: 0,
  blurb: c.blurb,
}));

/**
 * Categories from the API (includes admin-created categories and real listing
 * counts), seeded with the static taxonomy so navigation renders immediately.
 */
export function useCategories() {
  const query = useQuery({
    queryKey: ['categories'],
    queryFn: async (): Promise<CategoryInfo[]> => {
      const { categories } = await api.get<{ categories: (Omit<CategoryInfo, 'blurb'> & { listingCount: number })[] }>('/categories');
      const blurbs = new Map(STATIC.map((c) => [c.path, c.blurb]));
      return categories.map((c) => ({ ...c, blurb: blurbs.get(c.path) }));
    },
    staleTime: 5 * 60 * 1000,
    placeholderData: STATIC,
  });
  const list = query.data ?? STATIC;
  const byPath = new Map(list.map((c) => [c.path, c]));
  return {
    ...query,
    list,
    roots: list.filter((c) => c.depth === 0),
    get: (path: string) => byPath.get(path),
    children: (path: string) => list.filter((c) => c.parentPath === path),
  };
}
