import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

function useOverlayBehaviour(open: boolean, onClose: () => void, panel: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusables = () =>
      Array.from(panel.current?.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])') ?? []);
    requestAnimationFrame(() => (panel.current?.querySelector<HTMLElement>('[data-autofocus]') ?? focusables()[0] ?? panel.current)?.focus());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      } else if (e.key === 'Tab') {
        const items = focusables();
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open, onClose, panel]);
}

export function Modal({ open, onClose, title, children, className, labelledBy }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; className?: string; labelledBy?: string }) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useOverlayBehaviour(open, onClose, panel);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-6">
      <div className="absolute inset-0 animate-fade-in bg-charcoal/55 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy ?? (title ? titleId : undefined)}
        tabIndex={-1}
        className={cn('relative max-h-[94vh] w-full animate-slide-up overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:max-w-lg sm:rounded-xl', className)}
      >
        <button onClick={onClose} className="absolute top-3 right-3 z-10 rounded-full p-2 text-muted hover:bg-brand-100 hover:text-brand-900" aria-label="Close">
          <X className="size-5" />
        </button>
        {title && (
          <div id={titleId} className="border-b border-line px-6 py-4 pr-14 font-serif text-xl font-semibold text-brand-900">
            {title}
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function Drawer({ open, onClose, side = 'left', title, children, className, footer }: { open: boolean; onClose: () => void; side?: 'left' | 'right'; title: ReactNode; children: ReactNode; className?: string; footer?: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  useOverlayBehaviour(open, onClose, panel);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[65]">
      <div className="absolute inset-0 animate-fade-in bg-charcoal/50" onClick={onClose} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        tabIndex={-1}
        className={cn(
          'absolute top-0 bottom-0 flex w-[88vw] max-w-sm flex-col bg-white shadow-2xl',
          side === 'left' ? 'left-0 animate-slide-in-left' : 'right-0 animate-slide-in-right',
          className,
        )}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4">
          <div className="font-serif text-lg font-semibold text-brand-900">{title}</div>
          <button onClick={onClose} className="rounded-full p-2 text-muted hover:bg-brand-100" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
        {footer && <div className="shrink-0 border-t border-line p-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
