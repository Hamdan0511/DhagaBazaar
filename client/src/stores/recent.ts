import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** Recently searched terms and recently viewed categories/products, kept on this device only. */
interface RecentState {
  searches: string[];
  categories: string[];
  products: { id: string; title: string }[];
  addSearch: (q: string) => void;
  removeSearch: (q: string) => void;
  clearSearches: () => void;
  addCategory: (path: string) => void;
  addProduct: (p: { id: string; title: string }) => void;
}

export const useRecent = create<RecentState>()(
  persist(
    (set) => ({
      searches: [],
      categories: [],
      products: [],
      addSearch: (q) =>
        set((s) => {
          const term = q.trim();
          if (!term) return s;
          return { searches: [term, ...s.searches.filter((x) => x.toLowerCase() !== term.toLowerCase())].slice(0, 8) };
        }),
      removeSearch: (q) => set((s) => ({ searches: s.searches.filter((x) => x !== q) })),
      clearSearches: () => set({ searches: [] }),
      addCategory: (path) => set((s) => ({ categories: [path, ...s.categories.filter((x) => x !== path)].slice(0, 8) })),
      addProduct: (p) => set((s) => ({ products: [p, ...s.products.filter((x) => x.id !== p.id)].slice(0, 12) })),
    }),
    { name: 'dhaaga-recent', version: 1 },
  ),
);
