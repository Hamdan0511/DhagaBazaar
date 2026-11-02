import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/** A commerce action a guest attempted; it is replayed automatically after sign-in. */
export type PendingAction =
  | { type: 'cart.add'; productId: string; productTitle: string; lines: { variantId: string | null; quantity: number }[] }
  | { type: 'save.product'; productId: string; productTitle: string }
  | { type: 'save.supplier'; supplierId: string; supplierName: string }
  | { type: 'navigate'; to: string; label: string };

export type ToastTone = 'success' | 'error' | 'info';
export interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
  action?: { label: string; to: string };
}

interface UiState {
  authModal: { open: boolean; mode: 'login' | 'register'; reason?: string };
  pendingAction: PendingAction | null;
  toasts: Toast[];
  mobileNavOpen: boolean;
  openAuth: (opts?: { mode?: 'login' | 'register'; reason?: string; pending?: PendingAction }) => void;
  closeAuth: () => void;
  setAuthMode: (mode: 'login' | 'register') => void;
  takePendingAction: () => PendingAction | null;
  clearPendingAction: () => void;
  setPendingAction: (a: PendingAction | null) => void;
  toast: (t: Omit<Toast, 'id'>) => void;
  dismissToast: (id: number) => void;
  setMobileNav: (open: boolean) => void;
}

let toastId = 0;

export const useUi = create<UiState>()(
  persist(
    (set, get) => ({
      authModal: { open: false, mode: 'login' },
      pendingAction: null,
      toasts: [],
      mobileNavOpen: false,
      openAuth: ({ mode = 'login', reason, pending } = {}) =>
        set({ authModal: { open: true, mode, reason }, ...(pending ? { pendingAction: pending } : {}) }),
      closeAuth: () => set((s) => ({ authModal: { ...s.authModal, open: false } })),
      setAuthMode: (mode) => set((s) => ({ authModal: { ...s.authModal, mode } })),
      takePendingAction: () => {
        const a = get().pendingAction;
        set({ pendingAction: null });
        return a;
      },
      clearPendingAction: () => set({ pendingAction: null }),
      setPendingAction: (a) => set({ pendingAction: a }),
      toast: (t) => {
        const id = ++toastId;
        set((s) => ({ toasts: [...s.toasts.slice(-3), { ...t, id }] }));
        setTimeout(() => get().dismissToast(id), t.tone === 'error' ? 7000 : 5000);
      },
      dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
      setMobileNav: (open) => set({ mobileNavOpen: open }),
    }),
    {
      name: 'dhaaga-pending-action',
      // Session storage: the pending action survives a full-page sign-in redirect, but not a new browser session.
      storage: createJSONStorage(() => sessionStorage),
      partialize: (s) => ({ pendingAction: s.pendingAction }),
    },
  ),
);

export const toast = (t: Omit<Toast, 'id'>) => useUi.getState().toast(t);
