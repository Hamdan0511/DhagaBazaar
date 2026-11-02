import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Factory,
  ShoppingBag,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  Package,
  ShoppingCart,
  Store,
  UserRound,
} from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import { SearchBox } from './SearchBox';
import { useCategories, type CategoryInfo } from '@/lib/categories';
import { getCategoryImage } from '@/lib/images';
import { categoryUrl, cn } from '@/lib/utils';
import { homeFor, useAuth } from '@/hooks/useAuth';
import { useCart } from '@/hooks/useCommerce';
import { useUi } from '@/stores/ui';
import { buyWholesaleTo, sellWholesaleTo } from '@/lib/entryPoints';
import { MobileNavDrawer } from './MobileNav';
import { SmartImage } from '@/components/ui/Feedback';

/** Click/hover popover used by the header menus. */
function Popover({ trigger, children, align = 'left', hover = true, className, label }: { trigger: (open: boolean) => ReactNode; children: (close: () => void) => ReactNode; align?: 'left' | 'right' | 'center'; hover?: boolean; className?: string; label: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  /** A click "pins" the menu: it then stays open until an outside click, Escape, a second click or navigation. */
  const pinned = useRef(false);
  /** URL at the moment the menu opened (see the navigation effect below). */
  const openedAt = useRef('');
  const currentUrl = () => window.location.pathname + window.location.search;
  const location = useLocation();
  const close = () => {
    pinned.current = false;
    clearTimeout(timer.current);
    setOpen(false);
  };
  // Close when the user navigates away. React Router commits lazy-route navigations as
  // transitions, so this effect can fire *after* the URL changed and the user already
  // opened the menu on the new page; only close if the URL differs from when it opened.
  useEffect(() => {
    if (currentUrl() !== openedAt.current) close();
  }, [location.pathname, location.search]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && close();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  const enter = () => {
    if (!hover) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      openedAt.current = currentUrl();
      setOpen(true);
    }, 90);
  };
  const leave = () => {
    if (!hover || pinned.current) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(false), 140);
  };
  const onClick = () => {
    clearTimeout(timer.current);
    if (pinned.current) return close();
    // Opened by hover or closed: a click pins it open (never toggles a hover-opened menu shut).
    pinned.current = true;
    openedAt.current = currentUrl();
    setOpen(true);
  };
  return (
    <div ref={ref} className="relative" onMouseEnter={enter} onMouseLeave={leave}>
      <button type="button" onClick={onClick} aria-expanded={open} aria-haspopup="true" aria-label={label} className="flex cursor-pointer items-center rounded-md">
        {trigger(open)}
      </button>
      {open && (
        <div
          className={cn(
            'absolute top-full z-50 pt-2',
            align === 'right' ? 'right-0' : align === 'center' ? 'left-1/2 -translate-x-1/2' : 'left-0',
            className,
          )}
        >
          <div className="animate-fade-in overflow-hidden rounded-xl border border-line bg-white shadow-[var(--shadow-lift)]">{children(close)}</div>
        </div>
      )}
    </div>
  );
}

function TopBar() {
  return (
    <div className="bg-brand-900 text-[0.8125rem] text-brand-100">
      <div className="container-page flex h-9 items-center justify-between gap-4">
        <p className="flex min-w-0 items-center gap-3 truncate">
          <span className="font-medium text-white"><span className="sm:hidden">B2B Garment Marketplace</span><span className="hidden sm:inline">India&apos;s B2B Garment Marketplace</span></span>
          <span className="hidden h-3.5 w-px bg-brand-100/40 md:block" aria-hidden />
          <span className="hidden md:inline">Source Wholesale Fashion for Your Business</span>
        </p>
        <div className="flex shrink-0 items-center gap-4">
          <Popover
            label="Launch location"
            align="right"
            hover={false}
            className="w-72"
            trigger={(open) => (
              <span className="flex cursor-pointer items-center gap-1.5 hover:text-white">
                <MapPin className="size-3.5" aria-hidden /> Bengaluru <ChevronDown className={cn('size-3.5 transition-transform', open && 'rotate-180')} aria-hidden />
              </span>
            )}
          >
            {() => (
              <div className="p-4 text-sm text-charcoal">
                <div className="font-semibold text-brand-900">Launching in Bengaluru, Karnataka</div>
                <p className="mt-1.5 leading-relaxed text-muted">
                  Dhaaga Bazaar is onboarding its first wholesale partners in Bengaluru. Suppliers ship directly to retailers, so delivery coverage depends on each supplier.
                </p>
                <Link to="/how-it-works" className="link mt-3 inline-block text-sm">
                  How ordering works →
                </Link>
              </div>
            )}
          </Popover>
          <span className="h-3.5 w-px bg-brand-100/40" aria-hidden />
          <Popover
            label="Help and support"
            align="right"
            className="w-56"
            trigger={(open) => (
              <span className="flex cursor-pointer items-center gap-1.5 hover:text-white">
                <span className="hidden sm:inline">Help &amp; Support</span>
                <CircleHelp className="size-3.5 sm:hidden" aria-label="Help" />
                <ChevronDown className={cn('size-3.5 transition-transform', open && 'rotate-180')} aria-hidden />
              </span>
            )}
          >
            {() => (
              <ul className="py-2 text-sm text-charcoal">
                {[
                  ['Help Centre', '/help'],
                  ['How It Works', '/how-it-works'],
                  ['Contact Us', '/contact'],
                  ['Become a Supplier', '/become-a-supplier'],
                  ['Return & Refund Policy', '/returns'],
                ].map(([label, to]) => (
                  <li key={to}>
                    <Link to={to} className="block px-4 py-2 hover:bg-brand-50 hover:text-copper-500">
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Popover>
        </div>
      </div>
    </div>
  );
}

function AccountMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  if (!user) {
    // Guests get every entry point in one place: sign in, or register on either side of the marketplace.
    return (
      <Popover
        label="Login / Register"
        align="right"
        className="w-72"
        trigger={(open) => (
          <span className="flex items-center gap-2.5 text-[0.9375rem] font-medium text-charcoal hover:text-copper-500">
            <UserRound className="size-6 stroke-[1.5]" aria-hidden />
            <span className="hidden xl:inline">Login / Register</span>
            <ChevronDown className={cn('hidden size-4 transition-transform xl:block', open && 'rotate-180')} aria-hidden />
          </span>
        )}
      >
        {(close) => (
          <div className="p-3 text-sm">
            <div className="px-2 pb-2 text-xs font-semibold tracking-wide text-muted uppercase">Sign in</div>
            <div className="grid grid-cols-2 gap-2">
              <Link to="/login?as=retailer" onClick={close} className="flex h-10 items-center justify-center rounded-md bg-brand-900 font-medium text-white hover:bg-brand-800">
                Retailer Login
              </Link>
              <Link to="/login?as=supplier" onClick={close} className="flex h-10 items-center justify-center rounded-md border border-brand-900/80 font-medium text-brand-900 hover:bg-brand-50">
                Supplier Login
              </Link>
            </div>
            <div className="mt-3 border-t border-line pt-3 text-xs font-semibold tracking-wide text-muted uppercase">New to Dhaaga Bazaar?</div>
            <Link to="/register/retailer" onClick={close} className="mt-2 flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-brand-50">
              <ShoppingBag className="size-5 shrink-0 text-copper-600" aria-hidden />
              <span>
                <span className="block font-medium text-charcoal">Register as Retailer</span>
                <span className="text-xs text-muted">Buy wholesale for your shop</span>
              </span>
            </Link>
            <Link to="/register/supplier" onClick={close} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-brand-50">
              <Factory className="size-5 shrink-0 text-copper-600" aria-hidden />
              <span>
                <span className="block font-medium text-charcoal">Register as Supplier</span>
                <span className="text-xs text-muted">Sell your collections wholesale</span>
              </span>
            </Link>
            <Link to="/login?as=admin" onClick={close} className="mt-1 block border-t border-line px-2 pt-2.5 text-xs text-muted hover:text-copper-600">
              Admin login
            </Link>
          </div>
        )}
      </Popover>
    );
  }
  const first = user.fullName.split(' ')[0];
  const links =
    user.role === 'ADMIN'
      ? [['Admin dashboard', '/admin']]
      : user.role === 'SUPPLIER'
        ? [['Supplier portal', '/supplier'], ['My products', '/supplier/products'], ['Order requests', '/supplier/orders'], ['Notifications', '/supplier/notifications']]
        : [['My account', '/account'], ['My orders', '/account/orders'], ['My enquiries', '/account/enquiries'], ['Saved products', '/account/saved'], ['Notifications', '/account/notifications']];
  return (
    <Popover
      label="Account menu"
      align="right"
      className="w-60"
      trigger={(open) => (
        <span className="flex cursor-pointer items-center gap-2.5 text-[0.9375rem] font-medium text-charcoal hover:text-copper-500">
          <UserRound className="size-6 stroke-[1.5]" aria-hidden />
          <span className="hidden max-w-28 flex-col text-left leading-tight xl:flex">
            <span className="text-xs font-normal text-muted">Hello, {first}</span>
            <span className="truncate">Account</span>
          </span>
          <ChevronDown className={cn('hidden size-4 transition-transform xl:block', open && 'rotate-180')} aria-hidden />
        </span>
      )}
    >
      {(close) => (
        <div className="text-sm">
          <div className="border-b border-line px-4 py-3">
            <div className="truncate font-semibold text-charcoal">{user.fullName}</div>
            <div className="truncate text-xs text-muted">{user.retailer?.businessName ?? user.supplier?.businessName ?? user.email}</div>
          </div>
          <ul className="py-1.5">
            {links.map(([label, to]) => (
              <li key={to}>
                <Link to={to} className="flex items-center gap-2 px-4 py-2 hover:bg-brand-50 hover:text-copper-500">
                  {label}
                </Link>
              </li>
            ))}
          </ul>
          <button
            onClick={() => {
              close();
              logout.mutate(undefined, { onSuccess: () => navigate('/') });
            }}
            className="flex w-full items-center gap-2 border-t border-line px-4 py-2.5 text-left text-muted hover:bg-brand-50 hover:text-danger"
          >
            <LogOut className="size-4" aria-hidden /> Sign out
          </button>
        </div>
      )}
    </Popover>
  );
}

function CartButton({ compact = false }: { compact?: boolean }) {
  const { user } = useAuth();
  const cart = useCart();
  const count = cart.data?.itemCount ?? 0;
  const to = user && user.role !== 'RETAILER' ? homeFor(user) : '/cart';
  return (
    <Link to={to} className="relative flex items-center gap-2.5 text-[0.9375rem] font-medium text-charcoal hover:text-copper-500" aria-label={`Cart${count ? `, ${count} items` : ''}`}>
      <span className="relative">
        <ShoppingCart className="size-6 stroke-[1.5]" aria-hidden />
        {count > 0 && (
          <span className="absolute -top-2 -right-2.5 flex h-[1.15rem] min-w-[1.15rem] items-center justify-center rounded-full bg-copper-500 px-1 text-[0.6875rem] font-bold text-white">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </span>
      {!compact && <span className="hidden xl:inline">Cart</span>}
    </Link>
  );
}

function CategoryMegaPanel({ root, children, close }: { root: CategoryInfo; children: CategoryInfo[]; close: () => void }) {
  const image = getCategoryImage(root.path);
  return (
    <div className="flex w-[min(46rem,92vw)]">
      <div className="flex-1 p-5">
        <div className="mb-3 flex items-baseline justify-between">
          <span className="font-serif text-lg font-semibold text-brand-900">{root.name}</span>
          <Link to={categoryUrl(root.path)} onClick={close} className="text-sm font-medium text-copper-500 hover:underline">
            View all →
          </Link>
        </div>
        <ul className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-sm">
          {children.map((c) => (
            <li key={c.path}>
              <Link to={categoryUrl(c.path)} onClick={close} className="block rounded px-2 py-1.5 text-charcoal hover:bg-brand-50 hover:text-copper-500">
                {c.name}
              </Link>
            </li>
          ))}
        </ul>
      </div>
      {image && (
        <Link to={categoryUrl(root.path)} onClick={close} className="relative hidden w-56 shrink-0 overflow-hidden bg-brand-100 md:block">
          <SmartImage src={image.src} alt={image.alt} className="absolute inset-0 size-full object-cover" />
          <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-brand-950/80 to-transparent p-4 pt-12 text-sm font-medium text-white">
            Explore {root.name}
          </span>
        </Link>
      )}
    </div>
  );
}

function AllCategoriesPanel({ close }: { close: () => void }) {
  const cats = useCategories();
  const [active, setActive] = useState(cats.roots[0]?.path ?? 'womens-wear');
  const activeRoot = cats.get(active);
  return (
    <div className="flex w-[min(52rem,94vw)] text-sm">
      <ul className="w-60 shrink-0 border-r border-line bg-brand-50 py-2">
        {cats.roots.map((r) => (
          <li key={r.path}>
            <Link
              to={categoryUrl(r.path)}
              onMouseEnter={() => setActive(r.path)}
              onFocus={() => setActive(r.path)}
              onClick={close}
              className={cn('flex items-center justify-between px-4 py-2.5 font-medium', active === r.path ? 'bg-white text-copper-500' : 'text-charcoal hover:text-copper-500')}
            >
              {r.name}
              <ChevronRight className="size-4 opacity-60" aria-hidden />
            </Link>
          </li>
        ))}
        <li className="mt-2 border-t border-line pt-2">
          <Link to="/categories" onClick={close} className="block px-4 py-2.5 font-medium text-copper-500 hover:underline">
            Browse all categories
          </Link>
        </li>
      </ul>
      {activeRoot && (
        <div className="flex-1 p-5">
          <div className="mb-3 font-serif text-lg font-semibold text-brand-900">{activeRoot.name}</div>
          <ul className="grid grid-cols-2 gap-x-6 gap-y-0.5 lg:grid-cols-3">
            {cats.children(activeRoot.path).map((c) => (
              <li key={c.path}>
                <Link to={categoryUrl(c.path)} onClick={close} className="block rounded px-2 py-1.5 text-charcoal hover:bg-brand-50 hover:text-copper-500">
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

const MORE_LINKS: [string, string][] = [
  ['Ethnic Sets', 'womens-wear/ethnic-sets'],
  ['Co-ord Sets', 'womens-wear/co-ord-sets'],
  ["Women's Nightwear", 'womens-wear/nightwear'],
  ['Sportswear', 'mens-wear/sportswear'],
  ['School Uniforms', 'kids-wear/school-uniforms'],
  ['Ethnic Footwear', 'footwear/ethnic-footwear'],
  ['Textile Accessories', 'fabrics/textile-accessories'],
  ['Stoles & Shawls', 'accessories/stoles'],
];

function CategoryNav() {
  const cats = useCategories();
  return (
    <nav aria-label="Categories" className="hidden border-t border-line/70 lg:block">
      <div className="container-page flex h-[3.75rem] items-center justify-between gap-2">
        <Popover
          label="All categories"
          className="min-w-max"
          trigger={(open) => (
            <span className={cn('flex h-11 cursor-pointer items-center gap-2.5 rounded-md px-5 text-[0.9375rem] font-medium text-white transition-colors', open ? 'bg-brand-900' : 'bg-copper-600 hover:bg-brand-900')}>
              <Menu className="size-5" aria-hidden /> All Categories
            </span>
          )}
        >
          {(close) => <AllCategoriesPanel close={close} />}
        </Popover>
        {cats.roots.slice(0, 6).map((root, i) => (
          <Popover
            key={root.path}
            label={`${root.name} menu`}
            align={i >= 4 ? 'right' : i >= 2 ? 'center' : 'left'}
            trigger={(open) => (
              <span className={cn('flex h-11 cursor-pointer items-center gap-1.5 px-2 text-[0.9375rem] font-medium xl:px-3', open ? 'text-copper-500' : 'text-charcoal hover:text-copper-500')}>
                {root.name}
                <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} aria-hidden />
              </span>
            )}
          >
            {(close) => <CategoryMegaPanel root={root} children={cats.children(root.path)} close={close} />}
          </Popover>
        ))}
        <Popover
          label="More categories"
          align="right"
          className="w-64"
          trigger={(open) => (
            <span className={cn('flex h-11 cursor-pointer items-center gap-1.5 px-2 text-[0.9375rem] font-medium', open ? 'text-copper-500' : 'text-charcoal hover:text-copper-500')}>
              More <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} aria-hidden />
            </span>
          )}
        >
          {(close) => (
            <div className="py-2 text-sm">
              {cats.roots.length > 6 && (
                <ul className="border-b border-line pb-2">
                  {cats.roots.slice(6).map((r) => (
                    <li key={r.path}>
                      <Link to={categoryUrl(r.path)} onClick={close} className="block px-4 py-2 hover:bg-brand-50 hover:text-copper-500">
                        {r.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <div className="px-4 pt-1 pb-1 text-xs font-semibold tracking-wide text-muted uppercase">Quick links</div>
              <ul>
                {MORE_LINKS.map(([label, path]) => (
                  <li key={path}>
                    <Link to={categoryUrl(path)} onClick={close} className="block px-4 py-2 hover:bg-brand-50 hover:text-copper-500">
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="mt-1 border-t border-line pt-1">
                <Link to="/suppliers" onClick={close} className="block px-4 py-2 hover:bg-brand-50 hover:text-copper-500">
                  Supplier directory
                </Link>
                <Link to="/categories" onClick={close} className="block px-4 py-2 font-medium text-copper-500 hover:bg-brand-50">
                  All categories →
                </Link>
              </div>
            </div>
          )}
        </Popover>
      </div>
    </nav>
  );
}

/** Horizontally scrollable category chips for tablet/mobile. */
function MobileCategoryStrip() {
  const cats = useCategories();
  const { user } = useAuth();
  return (
    <nav aria-label="Categories" className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 pb-3 lg:hidden">
      {/* Phones have no room for these in the bar above, so both sides lead the strip. */}
      <Link to={buyWholesaleTo(user)} className="flex shrink-0 items-center gap-1.5 rounded-full bg-copper-600 px-3.5 py-1.5 text-[0.8125rem] font-medium whitespace-nowrap text-white sm:hidden">
        <ShoppingBag className="size-3.5" aria-hidden /> Buy Wholesale
      </Link>
      <Link to={sellWholesaleTo(user)} className="flex shrink-0 items-center gap-1.5 rounded-full border border-brand-900 bg-white px-3.5 py-1.5 text-[0.8125rem] font-medium whitespace-nowrap text-brand-900 sm:hidden">
        <Factory className="size-3.5" aria-hidden /> Sell Wholesale
      </Link>
      {cats.roots.map((r) => (
        <NavLink
          key={r.path}
          to={categoryUrl(r.path)}
          className={({ isActive }) =>
            cn('shrink-0 rounded-full border px-3.5 py-1.5 text-[0.8125rem] font-medium whitespace-nowrap', isActive ? 'border-copper-500 bg-copper-500 text-white' : 'border-line-strong bg-white text-charcoal')
          }
        >
          {r.name}
        </NavLink>
      ))}
    </nav>
  );
}

export function SiteHeader() {
  const setMobileNav = useUi((s) => s.setMobileNav);
  const { user } = useAuth();
  return (
    <header className="sticky top-0 z-40 print:hidden bg-ivory-light/95 backdrop-blur supports-[backdrop-filter]:bg-ivory-light/90">
      <TopBar />
      {/* Desktop main bar */}
      <div className="container-page hidden h-[6.25rem] items-center gap-5 lg:flex xl:gap-8">
        <Logo className="h-[4.25rem] xl:h-[4.6rem]" />
        <SearchBox className="mx-auto max-w-[39rem] flex-1" />
        <div className="flex shrink-0 items-center gap-4 xl:gap-6">
          <div className="flex items-center gap-2.5">
            <Link to={buyWholesaleTo(user)} className="flex h-11 items-center gap-2 rounded-lg bg-copper-600 px-3.5 text-[0.9375rem] font-medium whitespace-nowrap text-white shadow-sm transition-colors hover:bg-brand-900 xl:px-4">
              <ShoppingBag className="hidden size-5 stroke-[1.5] xl:block" aria-hidden /> Buy Wholesale
            </Link>
            <Link to={sellWholesaleTo(user)} className="flex h-11 items-center gap-2 rounded-lg border border-brand-900/40 bg-white/60 px-3.5 text-[0.9375rem] font-medium whitespace-nowrap text-brand-900 transition-colors hover:border-brand-900 hover:bg-white xl:px-4">
              <Factory className="hidden size-5 stroke-[1.5] xl:block" aria-hidden /> Sell Wholesale
            </Link>
          </div>
          <span className="h-8 w-px bg-line-strong" aria-hidden />
          <AccountMenu />
          <span className="h-8 w-px bg-line-strong" aria-hidden />
          <CartButton />
        </div>
      </div>
      {/* Mobile / tablet main bar */}
      <div className="container-page lg:hidden">
        <div className="flex h-16 items-center gap-3">
          <button onClick={() => setMobileNav(true)} className="-ml-2 rounded-md p-2 text-brand-900 hover:bg-brand-100" aria-label="Open menu">
            <Menu className="size-6" />
          </button>
          <Logo className="h-11 sm:h-12" />
          <div className="ml-auto flex items-center gap-4">
            <Link to={buyWholesaleTo(user)} className="hidden items-center gap-1.5 rounded-md bg-copper-600 px-3 py-1.5 text-sm font-medium text-white sm:flex">
              <ShoppingBag className="size-4" aria-hidden /> Buy Wholesale
            </Link>
            <Link to={sellWholesaleTo(user)} className="hidden items-center gap-1.5 rounded-md border border-brand-900/40 px-3 py-1.5 text-sm font-medium text-brand-900 sm:flex">
              <Factory className="size-4" aria-hidden /> Sell Wholesale
            </Link>
            <AccountMenu />
            <CartButton compact />
          </div>
        </div>
        <div className="pb-3">
          <SearchBox compact />
        </div>
        <MobileCategoryStrip />
      </div>
      <CategoryNav />
      <MobileNavDrawer />
    </header>
  );
}

export function MobileBottomNav() {
  const { user } = useAuth();
  const cart = useCart();
  const setMobileNav = useUi((s) => s.setMobileNav);
  const openAuth = useUi((s) => s.openAuth);
  const item = 'flex flex-1 flex-col items-center justify-center gap-0.5 text-[0.6875rem] font-medium';
  const cls = ({ isActive }: { isActive: boolean }) => cn(item, isActive ? 'text-copper-500' : 'text-muted');
  return (
    <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-40 flex print:hidden h-16 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      <NavLink to="/" end className={cls}>
        <Store className="size-5" aria-hidden /> Home
      </NavLink>
      <button onClick={() => setMobileNav(true)} className={cn(item, 'text-muted')}>
        <Menu className="size-5" aria-hidden /> Categories
      </button>
      <NavLink to={user && user.role !== 'RETAILER' ? homeFor(user) : '/cart'} className={cls}>
        <span className="relative">
          <ShoppingCart className="size-5" aria-hidden />
          {!!cart.data?.itemCount && <span className="absolute -top-1.5 -right-2 rounded-full bg-copper-500 px-1 text-[0.625rem] leading-4 font-bold text-white">{cart.data.itemCount}</span>}
        </span>
        Cart
      </NavLink>
      {user ? (
        <NavLink to={homeFor(user)} className={cls}>
          {user.role === 'RETAILER' ? <Package className="size-5" aria-hidden /> : <LayoutDashboard className="size-5" aria-hidden />}
          {user.role === 'RETAILER' ? 'Orders' : 'Portal'}
        </NavLink>
      ) : (
        <button onClick={() => openAuth({ mode: 'login' })} className={cn(item, 'text-muted')}>
          <UserRound className="size-5" aria-hidden /> Sign in
        </button>
      )}
    </nav>
  );
}
