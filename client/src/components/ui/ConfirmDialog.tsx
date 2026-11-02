import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Modal } from './Overlay';
import { Button } from './Button';
import { Textarea } from './Field';

interface Confirm {
  title: string;
  body?: ReactNode;
  confirmLabel: string;
  tone?: 'primary' | 'danger';
  /** When set, the admin must type a reason (stored and shared with the affected user). */
  reason?: { label: string; hint?: string; minLength?: number };
}

/**
 * Confirmation step for consequential actions. Resolves to `{ reason }` when confirmed
 * (reason is '' when none was asked for) or `null` when cancelled.
 */
export function useConfirmDialog() {
  const [state, setState] = useState<(Confirm & { value: string }) | null>(null);
  const resolver = useRef<((v: { reason: string } | null) => void) | null>(null);

  const confirm = useCallback((opts: Confirm) => {
    setState({ ...opts, value: '' });
    return new Promise<{ reason: string } | null>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const finish = (v: { reason: string } | null) => {
    resolver.current?.(v);
    resolver.current = null;
    setState(null);
  };

  const min = state?.reason?.minLength ?? 5;
  const tooShort = !!state?.reason && state.value.trim().length < min;
  const element = (
    <Modal open={!!state} onClose={() => finish(null)} title={state?.title}>
      {state && (
        <form
          className="space-y-4 p-6"
          onSubmit={(e) => {
            e.preventDefault();
            if (!tooShort) finish({ reason: state.value.trim() });
          }}
        >
          {state.body && <div className="text-sm leading-relaxed text-charcoal/85">{state.body}</div>}
          {state.reason && (
            <Textarea
              label={state.reason.label}
              hint={state.reason.hint ?? `At least ${min} characters. The supplier will see this.`}
              value={state.value}
              onChange={(e) => setState({ ...state, value: e.target.value })}
              className="min-h-28"
              required
              data-autofocus
            />
          )}
          <div className="flex justify-end gap-2">
            <Button variant="subtle" onClick={() => finish(null)}>
              Cancel
            </Button>
            <Button type="submit" variant={state.tone === 'danger' ? 'danger' : 'primary'} disabled={tooShort}>
              {state.confirmLabel}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );

  return { confirm, element };
}
