import { Link } from 'react-router-dom';
import { BadgeCheck, Heart, MapPin } from 'lucide-react';
import { formatINR, formatNumber, PRICE_UNIT_SHORT } from '@dhaaga/shared';
import type { ProductCardData } from '@/lib/types';
import { FixtureBadge, SmartImage } from '@/components/ui/Feedback';
import { useCommerceAction, useSavedIds } from '@/hooks/useCommerce';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { PLACEHOLDER_IMAGE } from '@/lib/images';

export function SaveProductButton({ id, title, className }: { id: string; title: string; className?: string }) {
  const saved = useSavedIds();
  const qc = useQueryClient();
  const { run } = useCommerceAction();
  const isSaved = saved.data?.productIds.includes(id) ?? false;
  return (
    <button
      type="button"
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (isSaved) {
          await api.delete(`/retailer/saved/products/${id}`);
          void qc.invalidateQueries({ queryKey: ['saved'] });
        } else run({ type: 'save.product', productId: id, productTitle: title }, 'Sign in to save products to your shortlist.');
      }}
      aria-pressed={isSaved}
      aria-label={isSaved ? `Remove ${title} from saved products` : `Save ${title}`}
      className={cn('flex size-9 items-center justify-center rounded-full bg-white/90 text-brand-900 shadow-sm backdrop-blur transition-colors hover:bg-white', className)}
    >
      <Heart className={cn('size-[1.1rem]', isSaved && 'fill-copper-500 text-copper-500')} />
    </button>
  );
}

export function ProductCard({ product }: { product: ProductCardData }) {
  const image = product.images[0];
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-xl border border-line bg-white transition-shadow hover:shadow-[var(--shadow-lift)]">
      <Link to={`/products/${product.id}`} className="relative block aspect-[4/5] overflow-hidden bg-brand-50">
        <SmartImage
          src={image?.url ?? PLACEHOLDER_IMAGE.src}
          alt={image?.altText ?? product.title}
          className={cn('absolute inset-0 size-full transition-transform duration-500 group-hover:scale-[1.03]', image ? 'object-cover' : 'object-contain p-8')}
        />
        {(product.availability !== 'AVAILABLE' || product.stockQuantity === 0) && (
          <span className={cn('absolute bottom-2 left-2 rounded px-2 py-0.5 text-[0.6875rem] font-semibold', product.availability === 'OUT_OF_STOCK' || product.stockQuantity === 0 ? 'bg-danger text-white' : 'bg-white/90 text-brand-900')}>
            {product.availability === 'OUT_OF_STOCK' || product.stockQuantity === 0 ? 'Out of stock' : 'Made to order'}
          </span>
        )}
      </Link>
      <SaveProductButton id={product.id} title={product.title} className="absolute top-2 right-2" />
      {product.isFixture && <FixtureBadge className="absolute top-2 left-2" />}
      <div className="flex flex-1 flex-col p-3.5">
        <Link to={`/products/${product.id}`} className="line-clamp-2 text-[0.9375rem] leading-snug font-medium text-charcoal hover:text-copper-600">
          {product.title}
        </Link>
        <div className="mt-2 flex items-baseline gap-1">
          <span className="text-lg font-semibold text-brand-900">{formatINR(product.pricePaise)}</span>
          <span className="text-xs text-muted">/ {PRICE_UNIT_SHORT[product.priceUnit]}</span>
        </div>
        <div className="mt-1 text-[0.8125rem] font-medium text-copper-700">
          MOQ {formatNumber(product.moq)} {product.priceUnit === 'METRE' ? 'm' : product.priceUnit === 'PAIR' ? 'pairs' : product.priceUnit === 'SET' ? 'sets' : 'pcs'}
        </div>
        <div className="mt-auto flex items-center gap-1.5 border-t border-line pt-2.5 text-xs text-muted">
          <span className="truncate">{product.supplier.businessName}</span>
          {product.supplier.isVerified && <BadgeCheck className="size-3.5 shrink-0 text-success" aria-label="Documents verified by Dhaaga Bazaar" />}
          {product.supplier.city && (
            <span className="ml-auto flex shrink-0 items-center gap-0.5">
              <MapPin className="size-3" aria-hidden />
              {product.supplier.city}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
