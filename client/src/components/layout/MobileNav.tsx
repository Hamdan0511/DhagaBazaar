import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronDown, Factory, ShoppingBag, Store } from 'lucide-react';
import { Drawer } from '@/components/ui/Overlay';
import { useCategories } from '@/lib/categories';
import { categoryUrl, cn } from '@/lib/utils';
import { useUi } from '@/stores/ui';
import { homeFor, useAuth } from '@/hooks/useAuth';
import { Logo } from '@/components/brand/Logo';
import { buyWholesaleTo, sellWholesaleTo } from '@/lib/entryPoints';

export function MobileNavDrawer() {
  const open = useUi((s) => s.mobileNavOpen);
  const setOpen = useUi((s) => s.setMobileNav);
  const openAuth = useUi((s) => s.openAuth);
  const { user, logout } = useAuth();
  const cats = useCategories();
  const [expanded, setExpanded] = useState<string | null>('womens-wear');
  const location = useLocation();
  // Same transition race as the header menus: only close if the URL changed since the drawer opened.
  const openedAt = useRef('');
  useEffect(() => {
    if (open) openedAt.current = window.location.pathname + window.location.search;
  }, [open]);
  useEffect(() => {
    if (window.location.pathname + window.location.search !== openedAt.current) setOpen(false);
  }, [location.pathname, location.search, setOpen]);
  const close = () => setOpen(false);

  return (
    <Drawer
      open={open}
      onClose={close}
      title={<Logo className="h-9" linked={false} />}
      footer={
        user ? (
          <div className="flex gap-2">
            <Link to={homeFor(user)} className="flex-1 rounded-md bg-brand-900 py-2.5 text-center text-sm font-medium text-white">
              {user.role === 'RETAILER' ? 'My account' : user.role === 'SUPPLIER' ? 'Supplier portal' : 'Admin'}
            </Link>
            <button onClick={() => logout.mutate()} className="rounded-md border border-line-strong px-4 py-2.5 text-sm font-medium text-muted">
              Sign out
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <button onClick={() => { close(); openAuth({ mode: 'login' }); }} className="flex-1 rounded-md bg-brand-900 py-2.5 text-sm font-medium text-white">
              Sign in
            </button>
            <Link to="/register" onClick={close} className="flex-1 rounded-md border border-brand-900 py-2.5 text-center text-sm font-medium text-brand-900">
              Register
            </Link>
          </div>
        )
      }
    >
      <div className="px-2 py-3">
        {/* Both sides of the marketplace, first thing in the menu. */}
        <div className="grid grid-cols-2 gap-2 px-1 pb-4">
          <Link to={buyWholesaleTo(user)} className="flex items-center justify-center gap-2 rounded-md bg-copper-600 px-3 py-3 text-sm font-medium text-white">
            <ShoppingBag className="size-4" aria-hidden /> Buy Wholesale
          </Link>
          <Link to={sellWholesaleTo(user)} className="flex items-center justify-center gap-2 rounded-md border border-brand-900 px-3 py-3 text-sm font-medium text-brand-900">
            <Factory className="size-4" aria-hidden /> Sell Wholesale
          </Link>
        </div>
        <div className="px-3 pb-2 text-xs font-semibold tracking-[0.2em] text-muted uppercase">Shop by category</div>
        <ul>
          {cats.roots.map((root) => {
            const isOpen = expanded === root.path;
            return (
              <li key={root.path} className="border-b border-line/70 last:border-0">
                <div className="flex items-center">
                  <Link to={categoryUrl(root.path)} className="flex-1 px-3 py-3 text-[0.9375rem] font-medium text-charcoal">
                    {root.name}
                  </Link>
                  <button onClick={() => setExpanded(isOpen ? null : root.path)} className="p-3 text-muted" aria-expanded={isOpen} aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${root.name}`}>
                    <ChevronDown className={cn('size-5 transition-transform', isOpen && 'rotate-180')} />
                  </button>
                </div>
                {isOpen && (
                  <ul className="grid grid-cols-2 gap-x-2 pb-3 pl-3">
                    {cats.children(root.path).map((c) => (
                      <li key={c.path}>
                        <Link to={categoryUrl(c.path)} className="block rounded px-2 py-2 text-sm text-muted active:bg-brand-50">
                          {c.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
        <div className="mt-4 space-y-1 border-t border-line px-1 pt-4 text-sm">
          {!user && (
            <div className="grid grid-cols-2 gap-2 pb-2">
              <Link to="/login?as=retailer" className="rounded-md bg-brand-50 px-3 py-2.5 text-center font-medium text-brand-900">
                Retailer Login
              </Link>
              <Link to="/login?as=supplier" className="rounded-md bg-brand-50 px-3 py-2.5 text-center font-medium text-brand-900">
                Supplier Login
              </Link>
              <Link to="/register/retailer" className="rounded-md border border-line-strong px-3 py-2.5 text-center font-medium text-brand-900">
                Register as Retailer
              </Link>
              <Link to="/register/supplier" className="rounded-md border border-line-strong px-3 py-2.5 text-center font-medium text-brand-900">
                Register as Supplier
              </Link>
            </div>
          )}
          <Link to="/become-a-supplier" className="flex items-center gap-2 rounded-md bg-brand-50 px-3 py-3 font-medium text-brand-900">
            <Store className="size-4" aria-hidden /> Become a Supplier
          </Link>
          {[
            ['All categories', '/categories'],
            ['Supplier directory', '/suppliers'],
            ['How it works', '/how-it-works'],
            ['Help Centre', '/help'],
            ['Contact us', '/contact'],
          ].map(([label, to]) => (
            <Link key={to} to={to} className="block rounded-md px-3 py-2.5 text-charcoal hover:bg-brand-50">
              {label}
            </Link>
          ))}
        </div>
      </div>
    </Drawer>
  );
}
