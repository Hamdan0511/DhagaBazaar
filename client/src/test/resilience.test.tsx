import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { categoryImages, imageCredits } from '@/lib/images';
import { tierUnitPricePaise } from '@dhaaga/shared';

function Boom({ fail }: { fail: boolean }) {
  if (fail) throw new Error('render failed');
  return <p>Page content</p>;
}

describe('error boundary', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows a recoverable message instead of a blank screen, and recovers on navigation', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { rerender } = render(
      <ErrorBoundary resetKey="/a">
        <Boom fail />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong on this page');
    expect(screen.getByRole('button', { name: 'Reload page' })).toBeInTheDocument();
    rerender(
      <ErrorBoundary resetKey="/b">
        <Boom fail={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Page content')).toBeInTheDocument();
  });

  it('explains a failed page download after a new release', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    function Chunk(): never {
      throw new Error('Failed to fetch dynamically imported module: /assets/x.js');
    }
    render(
      <ErrorBoundary>
        <Chunk />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('A new version of Dhaaga Bazaar is available');
  });
});

describe('category photo mapping', () => {
  it('maps every photo to a credited, free-licence asset and never to an unrelated placeholder', () => {
    const keys = new Set(imageCredits.map((c) => c.src));
    for (const [path, img] of Object.entries(categoryImages)) {
      expect(keys.has(img.src), path).toBe(true);
      expect(img.photographer, path).toBeTruthy();
      expect(img.url, path).toMatch(/^https:\/\/unsplash\.com\/photos\//);
    }
  });
});

describe('volume pricing', () => {
  it('uses the highest tier reached and never raises the price', () => {
    const tiers = [
      { minQty: 50, pricePaise: 59000 },
      { minQty: 100, pricePaise: 55000 },
    ];
    expect(tierUnitPricePaise(65000, tiers, 49)).toBe(65000);
    expect(tierUnitPricePaise(65000, tiers, 50)).toBe(59000);
    expect(tierUnitPricePaise(65000, tiers, 150)).toBe(55000);
    expect(tierUnitPricePaise(50000, [{ minQty: 10, pricePaise: 60000 }], 20)).toBe(50000);
    expect(tierUnitPricePaise(65000, undefined, 500)).toBe(65000);
  });
});
