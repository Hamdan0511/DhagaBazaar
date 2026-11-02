import { useEffect, type ReactNode } from 'react';
import { NavLink, Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, LogOut, type LucideIcon } from 'lucide-react';
import { cn, formatDate } from '@/lib/utils';
import { api, errorMessage } from '@/lib/api';
import type { Notification } from '@/lib/types';
import { EmptyState, ErrorState, PageLoader } from '@/components/ui/Feedback';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  badge?: number;
}

export function DashboardLayout({ title, subtitle, nav, children }: { title: string; subtitle?: ReactNode; nav: NavItem[]; children: ReactNode }) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="container-page py-6 sm:py-8">
      <div className="grid gap-6 lg:grid-cols-[15.5rem_minmax(0,1fr)] lg:gap-8 print:block">
        <aside className="min-w-0 print:hidden">
          <div className="mb-4 hidden lg:block">
            <div className="font-serif text-xl font-semibold text-brand-900">{title}</div>
            {subtitle && <div className="mt-0.5 text-sm text-muted">{subtitle}</div>}
          </div>
          <nav aria-label={`${title} navigation`} className="scrollbar-none -mx-4 flex gap-1 overflow-x-auto px-4 lg:mx-0 lg:block lg:space-y-0.5 lg:overflow-visible lg:rounded-xl lg:border lg:border-line lg:bg-white lg:p-2">
            {nav.map(({ to, label, icon: Icon, end, badge }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    'flex shrink-0 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors',
                    isActive ? 'bg-brand-900 text-white lg:bg-brand-50 lg:text-copper-600' : 'border border-line bg-white text-charcoal hover:bg-brand-50 lg:border-0 lg:bg-transparent',
                  )
                }
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                <span className="flex-1">{label}</span>
                {!!badge && <span className="rounded-full bg-copper-500 px-1.5 text-xs text-white">{badge}</span>}
              </NavLink>
            ))}
            <button
              type="button"
              disabled={logout.isPending}
              onClick={() => logout.mutate(undefined, { onSuccess: () => navigate('/') })}
              className="flex shrink-0 items-center gap-3 rounded-lg border border-line bg-white px-3 py-2 text-left text-sm font-medium whitespace-nowrap text-muted transition-colors hover:bg-brand-50 hover:text-danger lg:mt-1 lg:w-full lg:border-0 lg:border-t lg:bg-transparent lg:pt-2.5"
            >
              <LogOut className="size-4 shrink-0" aria-hidden /> Log out
            </button>
          </nav>
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  useEffect(() => {
    document.title = `${title} · Dhaaga Bazaar`;
  }, [title]);
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-serif text-2xl font-semibold sm:text-[1.75rem]">{title}</h1>
        {description && <div className="mt-1 text-sm text-muted">{description}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2 print:hidden">{actions}</div>}
    </div>
  );
}

export function StatCard({ label, value, to, icon: Icon }: { label: string; value: ReactNode; to?: string; icon?: LucideIcon }) {
  const body = (
    <div className="flex h-full items-start justify-between rounded-xl border border-line bg-white p-4 transition-shadow hover:shadow-[var(--shadow-card)]">
      <div>
        <div className="text-xs font-medium text-muted">{label}</div>
        <div className="mt-1 font-serif text-2xl font-semibold text-brand-900 tabular-nums">{value}</div>
      </div>
      {Icon && <Icon className="size-5 text-copper-500" aria-hidden />}
    </div>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

export function Panel({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-xl border border-line bg-white', className)}>
      {title && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <h2 className="font-serif text-lg font-semibold">{title}</h2>
          {actions}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function NotificationsView() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['notifications'], queryFn: () => api.get<{ notifications: Notification[]; unread: number }>('/notifications') });
  const readAll = useMutation({ mutationFn: () => api.post('/notifications/read-all'), onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }) });
  const read = useMutation({ mutationFn: (id: string) => api.post(`/notifications/${id}/read`), onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }) });
  return (
    <>
      <PageHeader
        title="Notifications"
        actions={
          !!q.data?.unread && (
            <Button variant="subtle" size="sm" onClick={() => readAll.mutate()} loading={readAll.isPending}>
              Mark all as read
            </Button>
          )
        }
      />
      {q.isLoading ? (
        <PageLoader />
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} />
      ) : !q.data!.notifications.length ? (
        <EmptyState icon={<Bell className="size-7" />} title="No notifications yet" description="Updates about your orders, enquiries and account will appear here." />
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-white">
          {q.data!.notifications.map((n) => (
            <li key={n.id} className={cn('flex gap-3 px-5 py-4', !n.readAt && 'bg-copper-50/50')}>
              <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.readAt ? 'bg-transparent' : 'bg-copper-500')} aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="font-medium">{n.title}</div>
                <div className="text-sm text-muted">{n.body}</div>
                <div className="mt-1 flex gap-3 text-xs text-muted">
                  {formatDate(n.createdAt, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
                  {n.link && (
                    <Link to={n.link} onClick={() => !n.readAt && read.mutate(n.id)} className="font-medium text-copper-600 hover:underline">
                      View
                    </Link>
                  )}
                  {!n.readAt && (
                    <button onClick={() => read.mutate(n.id)} className="hover:text-charcoal">
                      Mark read
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export function useUnreadCount() {
  return useQuery({ queryKey: ['notifications'], queryFn: () => api.get<{ notifications: Notification[]; unread: number }>('/notifications'), select: (d) => d.unread, refetchInterval: 60_000 });
}
