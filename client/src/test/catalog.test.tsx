import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FLAT_CATEGORIES, ROOT_CATEGORIES, getDescendantPaths, searchTaxonomy, validateOrderQuantity, FILTER_SETS } from '@dhaaga/shared';
import { categoryGallery, categoryImages, heroImages, imageCredits, promoImages, sectionImages } from '@/lib/images';
import { ProductCard } from '@/components/catalog/ProductCard';
import type { ProductCardData } from '@/lib/types';

const publicDir = path.resolve(__dirname, '../../public');

describe('image asset mapping', () => {
  it('points every mapped image at a real local file', () => {
    const all = [...Object.values(categoryImages), ...Object.values(categoryGallery).flat(), ...Object.values(heroImages), ...Object.values(promoImages), ...Object.values(sectionImages)];
    for (const img of all) expect(existsSync(path.join(publicDir, img.src)), img.src).toBe(true);
    expect(existsSync(path.join(publicDir, 'brand/placeholder.svg'))).toBe(true);
    expect(existsSync(path.join(publicDir, 'brand/logo.png'))).toBe(true);
  });

  it('has a representative photo for every top-level category', () => {
    for (const root of ROOT_CATEGORIES) expect(categoryImages[root.path], root.path).toBeDefined();
  });

  it('only maps images to categories that exist, with attribution recorded', () => {
    const paths = new Set(FLAT_CATEGORIES.map((c) => c.path));
    for (const p of Object.keys(categoryImages)) expect(paths.has(p), p).toBe(true);
    for (const c of imageCredits) {
      expect(c.photographer).toBeTruthy();
      expect(c.url).toMatch(/^https:\/\/unsplash\.com\/photos\//);
    }
  });
});

describe('taxonomy and B2B rules', () => {
  it('covers every required category group with category-specific filters', () => {
    expect(ROOT_CATEGORIES.map((c) => c.path)).toEqual(['womens-wear', 'mens-wear', 'kids-wear', 'footwear', 'fabrics', 'accessories']);
    const byPath = new Map(FLAT_CATEGORIES.map((c) => [c.path, c]));
    expect(byPath.get('womens-wear/sarees')!.filterSet).toBe('saree');
    expect(byPath.get('womens-wear/kurtis')!.filterSet).toBe('kurti');
    expect(byPath.get('footwear/sandals')!.filterSet).toBe('footwear');
    expect(FILTER_SETS.saree.map((f) => f.key)).toEqual(['fabric', 'occasion', 'sareeStyle', 'work', 'colour']);
  });

  it('includes subcategories in parent listings', () => {
    expect(getDescendantPaths('womens-wear')).toContain('womens-wear/dupattas');
  });

  it('suggests the right categories for common search terms', () => {
    expect(searchTaxonomy('sari')[0].path).toBe('womens-wear/sarees');
    expect(searchTaxonomy('kurti')[0].path).toBe('womens-wear/kurtis');
    expect(searchTaxonomy('jutti')[0].path).toBe('footwear/ethnic-footwear');
    expect(searchTaxonomy('')).toEqual([]);
  });

  it('never permits an order quantity below MOQ', () => {
    expect(validateOrderQuantity(9, 10)).toMatch(/Minimum order quantity is 10/);
    expect(validateOrderQuantity(10, 10)).toBeNull();
    expect(validateOrderQuantity(32, 30, 5)).toMatch(/steps of 5/);
    expect(validateOrderQuantity(35, 30, 5)).toBeNull();
    expect(validateOrderQuantity(0, 1)).not.toBeNull();
  });
});

const product: ProductCardData = {
  id: 'p1',
  title: 'Soft Silk Saree',
  pricePaise: 120000,
  priceUnit: 'PIECE',
  piecesPerSet: null,
  moq: 10,
  orderStep: 1,
  availability: 'AVAILABLE',
  stockQuantity: null,
  isFixture: false,
  createdAt: new Date().toISOString(),
  category: { path: 'womens-wear/sarees', name: 'Sarees' },
  supplier: { id: 's1', businessName: 'Silk House', city: 'Bengaluru', state: 'Karnataka', isVerified: false, isFixture: false },
  images: [],
};

function renderCard(p: ProductCardData) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <ProductCard product={p} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ProductCard', () => {
  it('shows real price and MOQ, and no verified mark unless genuinely verified', () => {
    renderCard(product);
    expect(screen.getByText('₹1,200')).toBeInTheDocument();
    expect(screen.getByText(/MOQ 10 pcs/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/verified/i)).toBeNull();
    expect(screen.queryByText(/not real/i)).toBeNull();
  });

  it('labels development fixtures unmistakably', () => {
    renderCard({ ...product, isFixture: true, supplier: { ...product.supplier, isVerified: true } });
    expect(screen.getByText(/Dev fixture · not real/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Documents verified by Dhaaga Bazaar/)).toBeInTheDocument();
  });
});
