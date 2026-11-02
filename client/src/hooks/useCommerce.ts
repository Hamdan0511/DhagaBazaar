import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import type { Cart } from '@/lib/types';
import { useAuth } from './useAuth';
import { toast, useUi, type PendingAction } from '@/stores/ui';

export const CART_KEY = ['cart'] as const;
export const SAVED_IDS_KEY = ['saved', 'ids'] as const;

export function useCart() {
  const { isRetailer } = useAuth();
  return useQuery({ queryKey: CART_KEY, queryFn: () => api.get<Cart>('/cart'), enabled: isRetailer, staleTime: 15_000 });
}

export function useSavedIds() {
  const { isRetailer } = useAuth();
  return useQuery({
    queryKey: SAVED_IDS_KEY,
    queryFn: () => api.get<{ productIds: string[]; supplierIds: string[] }>('/retailer/saved/ids'),
    enabled: isRetailer,
  });
}

/** Executes a commerce action against the API. Shared by direct clicks and post-login replay. */
export async function executeAction(action: PendingAction, qc: ReturnType<typeof useQueryClient>) {
  switch (action.type) {
    case 'cart.add': {
      const cart = await api.post<Cart>('/cart/items', { productId: action.productId, lines: action.lines });
      qc.setQueryData(CART_KEY, cart);
      const qty = action.lines.reduce((s, l) => s + l.quantity, 0);
      toast({ tone: 'success', title: 'Added to cart', description: `${qty} pcs · ${action.productTitle}`, action: { label: 'View cart', to: '/cart' } });
      return;
    }
    case 'save.product':
      await api.put(`/retailer/saved/products/${action.productId}`);
      void qc.invalidateQueries({ queryKey: ['saved'] });
      toast({ tone: 'success', title: 'Saved to your shortlist', description: action.productTitle });
      return;
    case 'save.supplier':
      await api.put(`/retailer/saved/suppliers/${action.supplierId}`);
      void qc.invalidateQueries({ queryKey: ['saved'] });
      toast({ tone: 'success', title: 'Supplier shortlisted', description: action.supplierName });
      return;
    case 'navigate':
      return;
  }
}

/**
 * Guards commerce actions. Guests are asked to sign in and the action is
 * replayed automatically afterwards. Supplier/admin accounts are told that
 * buying requires a retailer account.
 */
export function useCommerceAction() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const openAuth = useUi((s) => s.openAuth);

  const mutation = useMutation({
    mutationFn: (action: PendingAction) => executeAction(action, qc),
    onError: (e) => toast({ tone: 'error', title: 'Could not complete that', description: errorMessage(e) }),
  });

  const run = useCallback(
    (action: PendingAction, reason?: string) => {
      if (!user) {
        openAuth({ mode: 'login', reason, pending: action });
        return;
      }
      if (user.role !== 'RETAILER') {
        toast({
          tone: 'info',
          title: 'Retailer account required',
          description: 'Buying, saving and enquiring are available to retailer accounts. Supplier and admin accounts manage the marketplace from their portals.',
        });
        return;
      }
      mutation.mutate(action);
    },
    [user, openAuth, mutation],
  );

  return { run, isPending: mutation.isPending };
}
