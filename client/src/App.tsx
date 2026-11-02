import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { SiteHeader, MobileBottomNav } from '@/components/layout/SiteHeader';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { AuthModal, PendingActionRunner } from '@/components/auth/AuthModal';
import { PageLoader, Toaster } from '@/components/ui/Feedback';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { useAuth } from '@/hooks/useAuth';
import type { Role } from '@/lib/types';
import HomePage from '@/pages/HomePage';
import CategoryPage from '@/pages/CategoryPage';
import CategoriesIndexPage from '@/pages/CategoriesIndexPage';
import SearchPage from '@/pages/SearchPage';
import ProductPage from '@/pages/ProductPage';
import NotFoundPage from '@/pages/NotFoundPage';
import { LoginPage, RegisterChooserPage, RegisterPage, ForgotPasswordPage, ResetPasswordPage } from '@/pages/AuthPages';

const CartPage = lazy(() => import('@/pages/CartPage'));
const CheckoutPage = lazy(() => import('@/pages/CheckoutPage'));
const SupplierProfilePage = lazy(() => import('@/pages/SupplierProfilePage'));
const SuppliersDirectoryPage = lazy(() => import('@/pages/SuppliersDirectoryPage'));
const BecomeSupplierPage = lazy(() => import('@/pages/BecomeSupplierPage'));
const InfoRoutes = lazy(() => import('@/pages/info/InfoRoutes'));
const AccountRoutes = lazy(() => import('@/pages/account/AccountRoutes'));
const SupplierRoutes = lazy(() => import('@/pages/supplier/SupplierRoutes'));
const AdminRoutes = lazy(() => import('@/pages/admin/AdminRoutes'));

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo({ top: 0 }); }, [pathname]);
  return null;
}

function PublicLayout() {
  const { pathname } = useLocation();
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only z-[90] rounded bg-brand-900 px-4 py-2 text-white focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
        Skip to content
      </a>
      <SiteHeader />
      <main id="main" className="flex-1">
        <ErrorBoundary resetKey={pathname}>
          <Suspense fallback={<PageLoader />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>
      <SiteFooter />
      <MobileBottomNav />
    </div>
  );
}

/** Protects a route subtree by role. Guests are sent to sign in and returned afterwards. */
export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const location = useLocation();
  if (isLoading) return <PageLoader label="Checking your session…" />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (!roles.includes(user.role)) return <Navigate to={user.role === 'ADMIN' ? '/admin' : user.role === 'SUPPLIER' ? '/supplier' : '/account'} replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route element={<PublicLayout />}>
          <Route index element={<HomePage />} />
          <Route path="categories" element={<CategoriesIndexPage />} />
          <Route path="categories/*" element={<CategoryPage />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="products/:id" element={<ProductPage />} />
          <Route path="suppliers" element={<SuppliersDirectoryPage />} />
          <Route path="suppliers/:id" element={<SupplierProfilePage />} />
          <Route path="become-a-supplier" element={<BecomeSupplierPage />} />
          <Route path="cart" element={<CartPage />} />
          <Route path="checkout" element={<RequireRole roles={['RETAILER']}><CheckoutPage /></RequireRole>} />
          <Route path="login" element={<LoginPage />} />
          <Route path="register" element={<RegisterChooserPage />} />
          <Route path="register/:portal" element={<RegisterPage />} />
          <Route path="forgot-password" element={<ForgotPasswordPage />} />
          <Route path="reset-password" element={<ResetPasswordPage />} />
          <Route path="account/*" element={<RequireRole roles={['RETAILER']}><AccountRoutes /></RequireRole>} />
          <Route path="supplier/*" element={<RequireRole roles={['SUPPLIER']}><SupplierRoutes /></RequireRole>} />
          <Route path="*" element={<InfoRoutes fallback={<NotFoundPage />} />} />
        </Route>
        {/* The admin review portal has its own shell, separate from the marketplace layout. */}
        <Route
          path="admin/*"
          element={
            <RequireRole roles={['ADMIN']}>
              <ErrorBoundary>
                <Suspense fallback={<PageLoader />}>
                  <AdminRoutes />
                </Suspense>
              </ErrorBoundary>
            </RequireRole>
          }
        />
      </Routes>
      <AuthModal />
      <PendingActionRunner />
      <Toaster />
    </>
  );
}
