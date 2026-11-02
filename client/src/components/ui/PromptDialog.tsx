import { useCallback, useRef, useState } from 'react';
import { Modal } from './Overlay';
import { Button } from './Button';
import { Input, Textarea } from './Field';

interface Ask {
  title: string;
  label: string;
  confirmLabel?: string;
  initial?: string;
  multiline?: boolean;
  inputMode?: 'text' | 'decimal';
  required?: boolean;
}

/** In-app replacement for window.prompt — returns the entered text, or null if cancelled. */
export function usePromptDialog() {
  const [state, setState] = useState<(Ask & { value: string }) | null>(null);
  const resolver = useRef<((v: string | null) => void) | null>(null);

  const ask = useCallback((opts: Ask) => {
    setState({ ...opts, value: opts.initial ?? '' });
    return new Promise<string | null>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const finish = (v: string | null) => {
    resolver.current?.(v);
    resolver.current = null;
    setState(null);
  };

  const element = (
    <Modal open={!!state} onClose={() => finish(null)} title={state?.title}>
      {state && (
        <form
          className="space-y-4 p-6"
          onSubmit={(e) => {
            e.preventDefault();
            finish(state.value.trim());
          }}
        >
          {state.multiline ? (
            <Textarea label={state.label} value={state.value} onChange={(e) => setState({ ...state, value: e.target.value })} data-autofocus />
          ) : (
            <Input label={state.label} inputMode={state.inputMode} value={state.value} onChange={(e) => setState({ ...state, value: e.target.value })} data-autofocus />
          )}
          <div className="flex justify-end gap-2">
            <Button variant="subtle" onClick={() => finish(null)}>
              Cancel
            </Button>
            <Button type="submit" disabled={state.required !== false && !state.value.trim()}>
              {state.confirmLabel ?? 'Confirm'}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );

  return { ask, element };
}
