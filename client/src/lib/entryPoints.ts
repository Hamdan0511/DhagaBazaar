import type { SessionUser } from './types';

/**
 * The two sides of the marketplace. Guests are sent to the matching registration form;
 * signed-in users go straight to the part of the site they already have access to.
 */
export function buyWholesaleTo(user: SessionUser | null | undefined) {
  return user ? '/categories' : '/register/retailer';
}

export function sellWholesaleTo(user: SessionUser | null | undefined) {
  return user?.role === 'SUPPLIER' ? '/supplier' : '/register/supplier';
}
