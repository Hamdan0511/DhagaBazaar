import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

/** The official Dhaaga Bazaar logo (extracted from the supplied artwork, not redrawn). */
export function Logo({ className, variant = 'mark', linked = true }: { className?: string; variant?: 'mark' | 'full'; linked?: boolean }) {
  const img = (
    <img
      src={variant === 'full' ? '/brand/logo-full.png' : '/brand/logo.png'}
      alt="Dhaaga Bazaar — India's B2B Garment Marketplace"
      width={variant === 'full' ? 689 : 548}
      height={variant === 'full' ? 260 : 180}
      className={cn('w-auto select-none', className)}
      draggable={false}
    />
  );
  if (!linked) return img;
  return (
    <Link to="/" className="inline-flex shrink-0 items-center" aria-label="Dhaaga Bazaar home">
      {img}
    </Link>
  );
}
