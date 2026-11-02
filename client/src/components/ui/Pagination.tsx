import { ChevronLeft, ChevronRight } from 'lucide-react';
import { formatNumber } from '@dhaaga/shared';
import { cn } from '@/lib/utils';

/** "Showing 1–20 of 57" with previous/next buttons. Hidden when everything fits on one page. */
export function Pagination({ page, pageSize, total, onPage, className }: { page: number; pageSize: number; total: number; onPage: (page: number) => void; className?: string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const btn = 'inline-flex h-9 items-center gap-1 rounded-md border border-line-strong bg-white px-3 text-sm font-medium text-charcoal hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-40';
  return (
    <nav aria-label="Pagination" className={cn('flex flex-wrap items-center justify-between gap-3 text-sm text-muted', className)}>
      <span>
        Showing {formatNumber(from)}–{formatNumber(to)} of {formatNumber(total)}
      </span>
      {pages > 1 && (
        <span className="flex items-center gap-2">
          <button type="button" className={btn} disabled={page <= 1} onClick={() => onPage(page - 1)}>
            <ChevronLeft className="size-4" aria-hidden /> Previous
          </button>
          <span className="tabular-nums">
            Page {page} of {pages}
          </span>
          <button type="button" className={btn} disabled={page >= pages} onClick={() => onPage(page + 1)}>
            Next <ChevronRight className="size-4" aria-hidden />
          </button>
        </span>
      )}
    </nav>
  );
}
