import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, ChevronRight, Info, Loader2, X } from 'lucide-react';
import { cn, titleCase } from '@/lib/utils';
import { useUi } from '@/stores/ui';
import { PLACEHOLDER_IMAGE } from '@/lib/images';

export function Spinner({ className, label = 'Loading' }: { className?: string; label?: string }) {
  return (
    <span role="status" className={cn('inline-flex items-center gap-2 text-muted', className)}>
      <Loader2 className="size-5 animate-spin text-copper-500" aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function PageLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] items-center justify-center" role="status">
      <div className="flex flex-col items-center gap-3 text-sm text-muted">
        <Loader2 className="size-7 animate-spin text-copper-500" aria-hidden />
        {label}
      </div>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-brand-100', className)} aria-hidden />;
}

export function EmptyState({ icon, title, description, actions, className }: { icon?: ReactNode; title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center rounded-xl border border-dashed border-line-strong bg-white/70 px-6 py-12 text-center', className)}>
      {icon && <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-brand-100 text-copper-500">{icon}</div>}
      <h3 className="font-serif text-xl font-semibold text-brand-900">{title}</h3>
      {description && <div className="mt-2 max-w-md text-[0.9375rem] leading-relaxed text-muted">{description}</div>}
      {actions && <div className="mt-6 flex flex-wrap justify-center gap-3">{actions}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-danger/20 bg-danger-bg px-6 py-10 text-center" role="alert">
      <AlertTriangle className="size-8 text-danger" aria-hidden />
      <p className="mt-3 max-w-md text-sm text-danger">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-4 rounded-md border border-danger/30 bg-white px-4 py-2 text-sm font-medium text-danger hover:bg-danger/5">
          Try again
        </button>
      )}
    </div>
  );
}

export function Alert({ tone = 'info', title, children, className }: { tone?: 'info' | 'success' | 'warning' | 'danger'; title?: ReactNode; children?: ReactNode; className?: string }) {
  const styles = {
    info: 'bg-info-bg text-info border-info/15',
    success: 'bg-success-bg text-success border-success/15',
    warning: 'bg-warning-bg text-warning border-warning/20',
    danger: 'bg-danger-bg text-danger border-danger/15',
  }[tone];
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'info' ? Info : AlertTriangle;
  return (
    <div className={cn('flex gap-3 rounded-lg border px-4 py-3 text-sm', styles, className)} role={tone === 'danger' ? 'alert' : 'status'}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 leading-relaxed">
        {title && <div className="font-semibold">{title}</div>}
        {children}
      </div>
    </div>
  );
}

const STATUS_TONES: Record<string, string> = {
  APPROVED: 'bg-success-bg text-success',
  ACCEPTED: 'bg-success-bg text-success',
  CONFIRMED: 'bg-success-bg text-success',
  DELIVERED: 'bg-success-bg text-success',
  COMPLETED: 'bg-success-bg text-success',
  RESOLVED: 'bg-success-bg text-success',
  RESPONDED: 'bg-success-bg text-success',
  PAID: 'bg-success-bg text-success',
  PENDING_REVIEW: 'bg-warning-bg text-warning',
  INFO_REQUESTED: 'bg-info-bg text-info',
  INCOMPLETE: 'bg-brand-100 text-brand-800',
  PENDING: 'bg-warning-bg text-warning',
  REQUESTED: 'bg-warning-bg text-warning',
  OPEN: 'bg-warning-bg text-warning',
  IN_REVIEW: 'bg-warning-bg text-warning',
  PARTIALLY_CONFIRMED: 'bg-warning-bg text-warning',
  INVOICED: 'bg-info-bg text-info',
  PROCESSING: 'bg-info-bg text-info',
  DISPATCHED: 'bg-info-bg text-info',
  IN_FULFILMENT: 'bg-info-bg text-info',
  IN_TRANSIT: 'bg-info-bg text-info',
  REJECTED: 'bg-danger-bg text-danger',
  SUSPENDED: 'bg-danger-bg text-danger',
  CANCELLED: 'bg-danger-bg text-danger',
  OUT_OF_STOCK: 'bg-danger-bg text-danger',
};

export function StatusBadge({ status, label, className }: { status: string; label?: string; className?: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap', STATUS_TONES[status] ?? 'bg-brand-100 text-brand-800', className)}>
      {label ?? titleCase(status)}
    </span>
  );
}

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center gap-1 rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-medium text-brand-800', className)}>{children}</span>;
}

/** Clearly marks test data so it can never be mistaken for a real listing. */
export function FixtureBadge({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center rounded bg-[#ffe9a8] px-2 py-0.5 text-[0.6875rem] font-bold tracking-wide text-[#6b4b00] uppercase', className)} title="Development fixture — not a real listing">
      Dev fixture · not real
    </span>
  );
}

export function Breadcrumbs({ items, className }: { items: { label: string; to?: string }[]; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={cn('text-[0.8125rem] text-muted', className)}>
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((item, i) => (
          <li key={i} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="size-3.5 text-line-strong" aria-hidden />}
            {item.to && i < items.length - 1 ? (
              <Link to={item.to} className="hover:text-copper-500 hover:underline">
                {item.label}
              </Link>
            ) : (
              <span aria-current={i === items.length - 1 ? 'page' : undefined} className={cn(i === items.length - 1 && 'font-medium text-charcoal')}>
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Lazy image with a branded fallback if the file fails to load. */
export function SmartImage({ src, alt, className, eager, sizes, ...rest }: React.ImgHTMLAttributes<HTMLImageElement> & { eager?: boolean }) {
  const [failed, setFailed] = useState(false);
  return (
    <img
      src={failed || !src ? PLACEHOLDER_IMAGE.src : src}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      sizes={sizes}
      onError={() => setFailed(true)}
      className={cn('bg-brand-100', className)}
      {...rest}
    />
  );
}

export function Toaster() {
  const toasts = useUi((s) => s.toasts);
  const dismiss = useUi((s) => s.dismissToast);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[80] print:hidden flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:items-end" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto flex w-full max-w-sm animate-slide-up items-start gap-3 rounded-lg border border-line bg-white p-4 shadow-[var(--shadow-lift)]">
          {t.tone === 'success' ? (
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
          ) : t.tone === 'error' ? (
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden />
          ) : (
            <Info className="mt-0.5 size-5 shrink-0 text-info" aria-hidden />
          )}
          <div className="min-w-0 flex-1 text-sm">
            <div className="font-semibold text-charcoal">{t.title}</div>
            {t.description && <div className="mt-0.5 text-muted">{t.description}</div>}
            {t.action && (
              <Link to={t.action.to} onClick={() => dismiss(t.id)} className="mt-1.5 inline-block font-semibold text-copper-500 hover:underline">
                {t.action.label} →
              </Link>
            )}
          </div>
          <button onClick={() => dismiss(t.id)} className="rounded p-0.5 text-muted hover:text-charcoal" aria-label="Dismiss notification">
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
