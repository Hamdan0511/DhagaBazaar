import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Bell,
  CircleSlash,
  ClipboardCheck,
  ExternalLink,
  FileCheck2,
  FolderTree,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  PackageCheck,
  PackageX,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Store,
  UserCheck,
  Users,
  X,
  BadgeIndianRupee,
  LifeBuoy,
  Inbox,
  type LucideIcon,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { useUnreadCount } from '@/components/dashboard/DashboardLayout';
import { cn } from '@/lib/utils';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';

interface Item {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  badge?: number;
}

export interface AdminCounts {
  pendingSuppliers: number;
  infoRequestedSuppliers: number;
  pendingProducts: number;
  pendingDocuments: number;
}

/** Live queue sizes for the sidebar badges (same numbers as the overview). */
export function useAdminCounts() {
  return useQuery({
    queryKey: ['admin', 'overview'],
    queryFn: () => api.get<{ stats: AdminCounts & Record<string, number> }>('/admin/overview'),
    refetchInterval: 60_000,
  });
}

function NavGroup({ title, items, onNavigate }: { title?: string; items: Item[]; onNavigate?: () => void }) {
  return (
    <div className="mt-5 first:mt-0">
      {title && <div className="px-3 pb-1.5 text-[0.6875rem] font-semibold tracking-[0.18em] text-gold-300/80 uppercase">{title}</div>}
      <ul className="space-y-0.5">
        {items.map(({ to, label, icon: Icon, end, badge }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={end}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive ? 'bg-white text-brand-900 shadow-sm' : 'text-white/80 hover:bg-white/10 hover:text-white',
                )
              }
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              <span className="flex-1 truncate">{label}</span>
              {!!badge && <span className="rounded-full bg-copper-500 px-1.5 text-xs font-semibold text-white tabular-nums">{badge}</span>}
            </NavLink>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const counts = useAdminCounts().data?.stats;
  const unread = useUnreadCount();
  return (
    <div className="flex h-full flex-col">
      <Link to="/admin" onClick={onNavigate} className="flex items-center gap-3 px-5 pt-6 pb-5">
        <span className="flex size-10 items-center justify-center rounded-lg bg-white/10 ring-1 ring-gold-300/40">
          <ShieldCheck className="size-5 text-gold-300" aria-hidden />
        </span>
        <span className="leading-tight">
          <span className="block font-serif text-lg font-semibold text-white">Dhaaga Bazaar</span>
          <span className="text-[0.6875rem] font-semibold tracking-[0.2em] text-gold-300 uppercase">Admin Review Portal</span>
        </span>
      </Link>
      <nav aria-label="Admin navigation" className="scrollbar-none flex-1 overflow-y-auto px-3 pb-4">
        <NavGroup onNavigate={onNavigate} items={[{ to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true }]} />
        <NavGroup
          title="Supplier review"
          onNavigate={onNavigate}
          items={[
            { to: '/admin/applications', label: 'Supplier Applications', icon: ClipboardCheck, badge: (counts?.pendingSuppliers ?? 0) + (counts?.infoRequestedSuppliers ?? 0) },
            { to: '/admin/documents', label: 'Verification Documents', icon: FileCheck2, badge: counts?.pendingDocuments },
            { to: '/admin/suppliers/approved', label: 'Approved Suppliers', icon: UserCheck },
            { to: '/admin/suppliers/rejected', label: 'Rejected Applications', icon: CircleSlash },
          ]}
        />
        <NavGroup
          title="Marketplace"
          onNavigate={onNavigate}
          items={[
            { to: '/admin/retailers', label: 'Retailer Management', icon: Users },
            { to: '/admin/products/pending', label: 'Product Approvals', icon: PackageCheck, badge: counts?.pendingProducts },
            { to: '/admin/products/live', label: 'Live Products', icon: Store },
            { to: '/admin/products/unpublished', label: 'Unpublished Products', icon: PackageX },
            { to: '/admin/categories', label: 'Categories', icon: FolderTree },
            { to: '/admin/orders', label: 'Orders', icon: ShoppingBag },
            { to: '/admin/commissions', label: 'Commissions', icon: BadgeIndianRupee },
            { to: '/admin/complaints', label: 'Complaints', icon: LifeBuoy },
            { to: '/admin/messages', label: 'Contact Messages', icon: Inbox },
          ]}
        />
        <NavGroup
          title="System"
          onNavigate={onNavigate}
          items={[
            { to: '/admin/notifications', label: 'Notifications', icon: Bell, badge: unread.data },
            { to: '/admin/audit', label: 'Audit Logs', icon: History },
            { to: '/admin/settings', label: 'Settings', icon: Settings },
          ]}
        />
      </nav>
      <div className="border-t border-white/10 p-3">
        <button
          type="button"
          disabled={logout.isPending}
          onClick={() => logout.mutate(undefined, { onSuccess: () => navigate('/') })}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-white/80 hover:bg-white/10 hover:text-white"
        >
          <LogOut className="size-4" aria-hidden /> Log out
        </button>
      </div>
    </div>
  );
}

/** The admin portal's own shell — no marketplace header, footer or shopping navigation. */
export function AdminLayout({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => setOpen(false), [pathname]);
  return (
    <div className="min-h-screen bg-[#f7f2ea] lg:grid lg:grid-cols-[17rem_minmax(0,1fr)] lg:bg-[linear-gradient(to_right,#3d1c0a_17rem,#f7f2ea_17rem)]">
      <a href="#admin-main" className="sr-only z-[90] rounded bg-brand-900 px-4 py-2 text-white focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
        Skip to content
      </a>
      <aside className="sticky top-0 hidden h-screen bg-gradient-to-b from-[#54270F] to-[#3d1c0a] lg:block">
        <Sidebar />
      </aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Admin navigation">
          <div className="absolute inset-0 bg-charcoal/60" onClick={() => setOpen(false)} aria-hidden />
          <aside className="absolute inset-y-0 left-0 w-[17rem] max-w-[85vw] animate-slide-in-left bg-gradient-to-b from-[#54270F] to-[#3d1c0a] shadow-2xl">
            <button onClick={() => setOpen(false)} className="absolute top-4 right-3 rounded-full p-2 text-white/80 hover:bg-white/10" aria-label="Close menu">
              <X className="size-5" />
            </button>
            <Sidebar onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}
      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-white/95 px-4 backdrop-blur sm:px-6">
          <button onClick={() => setOpen(true)} className="-ml-1 rounded-md p-2 text-brand-900 hover:bg-brand-50 lg:hidden" aria-label="Open admin menu">
            <Menu className="size-6" />
          </button>
          <span className="font-serif text-lg font-semibold text-brand-900 lg:hidden">Admin Portal</span>
          <div className="ml-auto flex items-center gap-4 text-sm">
            <a href="/" target="_blank" rel="noreferrer" className="hidden items-center gap-1.5 font-medium text-copper-600 hover:text-brand-900 sm:inline-flex">
              View marketplace <ExternalLink className="size-3.5" aria-hidden />
            </a>
            <span className="hidden h-6 w-px bg-line-strong sm:block" aria-hidden />
            <span className="flex items-center gap-2.5">
              <span className="flex size-9 items-center justify-center rounded-full bg-brand-900 text-sm font-semibold text-white">{user?.fullName.charAt(0) ?? 'A'}</span>
              <span className="hidden leading-tight sm:block">
                <span className="block font-medium text-charcoal">{user?.fullName}</span>
                <span className="text-xs text-muted">{user?.email}</span>
              </span>
            </span>
          </div>
        </header>
        <main id="admin-main" className="mx-auto w-full max-w-[90rem] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <ErrorBoundary resetKey={pathname}>{children}</ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
