import { useEffect, useState, type ReactNode } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Check, Factory, ShoppingBag } from 'lucide-react';
import { resetPasswordSchema } from '@dhaaga/shared';
import { ForgotPasswordForm, LoginForm, RegisterForm } from '@/components/auth/AuthForms';
import { Logo } from '@/components/brand/Logo';
import { homeFor, useAuth } from '@/hooks/useAuth';
import { useUi } from '@/stores/ui';
import { Alert } from '@/components/ui/Feedback';
import { Input } from '@/components/ui/Field';
import { Button, ButtonLink } from '@/components/ui/Button';
import { api, errorMessage } from '@/lib/api';
import { heroImages } from '@/lib/images';
import type { SessionUser } from '@/lib/types';

function AuthShell({ title, subtitle, children }: { title: string; subtitle: ReactNode; children: ReactNode }) {
  useEffect(() => {
    document.title = `${title} · Dhaaga Bazaar`;
  }, [title]);
  return (
    <div className="container-page grid gap-8 py-10 lg:grid-cols-2 lg:py-14">
      <div className="relative hidden overflow-hidden rounded-2xl bg-brand-100 lg:block">
        <img src={heroImages.saree.src} alt="" className="absolute inset-0 size-full object-cover object-[12%_20%]" />
        <div className="absolute inset-0 bg-gradient-to-t from-brand-950/80 via-transparent to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-10 text-white">
          <p className="font-serif text-3xl leading-tight font-semibold text-white">Where Indian retailers discover wholesale garments.</p>
          <p className="mt-3 text-white/80">Browse freely. Sign in only when you&apos;re ready to order, save or enquire.</p>
        </div>
      </div>
      <div className="mx-auto w-full max-w-xl">
        <Logo className="mb-6 h-14 lg:hidden" />
        <h1 className="font-serif text-3xl font-semibold">{title}</h1>
        <div className="mt-2 mb-6 text-sm text-muted">{subtitle}</div>
        <div className="rounded-2xl border border-line bg-white p-6 sm:p-8">{children}</div>
      </div>
    </div>
  );
}

function useAfterAuth() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const pending = useUi((s) => s.pendingAction);
  return (user: SessionUser) => {
    const next = params.get('next');
    if (next && next.startsWith('/') && !next.startsWith('//')) return navigate(next, { replace: true });
    if (pending && user.role === 'RETAILER') return navigate(-1); // PendingActionRunner replays the action
    navigate(homeFor(user), { replace: true });
  };
}

export function LoginPage() {
  const { user } = useAuth();
  const after = useAfterAuth();
  const [forgot, setForgot] = useState(false);
  // ?as= only changes the wording: one sign-in form serves every role and each account
  // lands on its own dashboard.
  const [params] = useSearchParams();
  const as = params.get('as');
  if (user) return <AlreadySignedIn />;
  const title = forgot ? 'Reset your password' : as === 'retailer' ? 'Retailer Login' : as === 'supplier' ? 'Supplier Login' : as === 'admin' ? 'Admin Login' : 'Sign in to continue';
  return (
    <AuthShell
      title={title}
      subtitle={
        as === 'admin' ? (
          'For Dhaaga Bazaar staff accounts only.'
        ) : as === 'retailer' ? (
          <>
            Buying for your shop?{' '}
            <Link to="/register/retailer" className="link">
              Register as a retailer
            </Link>
          </>
        ) : as === 'supplier' ? (
          <>
            Selling wholesale?{' '}
            <Link to="/register/supplier" className="link">
              Register as a supplier
            </Link>
          </>
        ) : (
        <>
          New to Dhaaga Bazaar? Register as a{' '}
          <Link to="/register/retailer" className="link">
            retailer
          </Link>{' '}
          or a{' '}
          <Link to="/register/supplier" className="link">
            supplier
          </Link>
        </>
        )
      }
    >
      {forgot ? <ForgotPasswordForm onBack={() => setForgot(false)} /> : <LoginForm onSuccess={after} onForgot={() => setForgot(true)} />}
    </AuthShell>
  );
}

const REGISTRATION_CHOICES = [
  {
    to: '/register/retailer',
    icon: ShoppingBag,
    eyebrow: 'Buy wholesale',
    title: 'Retailer Registration',
    description: 'Discover wholesale clothing, connect with suppliers and purchase in bulk for your shop.',
    who: 'For retailers, boutique owners and resellers',
    points: ['Order in bulk from many suppliers in one cart', 'MOQ and stock checked as you shop', 'Track every supplier order in one dashboard'],
    cta: 'Register as Retailer',
  },
  {
    to: '/register/supplier',
    icon: Factory,
    eyebrow: 'Sell wholesale',
    title: 'Supplier Registration',
    description: 'Showcase your collections, connect with retailers and grow your wholesale business.',
    who: 'For manufacturers, wholesalers and distributors',
    points: ['List products with your prices, MOQ and stock', 'Receive bulk orders and enquiries', 'Reviewed by our team before going live'],
    cta: 'Register as Supplier',
  },
] as const;

/**
 * Explains the current session instead of hiding the page: registering a second
 * business account needs a separate sign-in, so offer to sign out right here.
 */
function SignedInNotice({ compact = false }: { compact?: boolean }) {
  const { user, logout } = useAuth();
  if (!user) return null;
  const role = user.role === 'RETAILER' ? 'retailer' : user.role === 'SUPPLIER' ? 'supplier' : 'admin';
  return (
    <Alert tone="info" className={compact ? 'mb-6' : 'mx-auto mt-6 max-w-4xl'} title={`You're signed in as ${user.email} (${role} account)`}>
      <p>To register a different business, sign out first. Your current account is not affected.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" loading={logout.isPending} onClick={() => logout.mutate()}>
          Sign out to register
        </Button>
        <ButtonLink to={homeFor(user)} size="sm" variant="subtle">
          Go to my {role} dashboard
        </ButtonLink>
      </div>
    </Alert>
  );
}

/** /register — both registration choices, always visible and equally prominent. */
export function RegisterChooserPage() {
  useEffect(() => {
    document.title = 'Create an account · Dhaaga Bazaar';
  }, []);
  return (
    <div className="container-page py-10 lg:py-14">
      <p className="eyebrow text-center">Join Dhaaga Bazaar</p>
      <h1 className="mt-3 text-center font-serif text-3xl font-semibold sm:text-4xl">Create your business account</h1>
      <p className="mt-2 text-center text-muted">
        Choose how you&apos;ll use the marketplace. Already registered?{' '}
        <Link to="/login" className="link">
          Sign in
        </Link>
      </p>
      <SignedInNotice />
      <ul className="mx-auto mt-8 grid max-w-4xl gap-5 md:grid-cols-2" aria-label="Registration options">
        {REGISTRATION_CHOICES.map(({ to, icon: Icon, eyebrow, title, description, who, points, cta }) => (
          <li key={to} className="flex flex-col rounded-2xl border border-line bg-white p-6 shadow-[var(--shadow-card)] transition-shadow hover:border-copper-400 hover:shadow-[var(--shadow-lift)] sm:p-8">
            <div className="flex items-center gap-4">
              <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-ivory text-copper-600 ring-1 ring-gold-400/60">
                <Icon className="size-7 stroke-[1.4]" aria-hidden />
              </span>
              <span className="text-xs font-semibold tracking-[0.25em] text-copper-600 uppercase">{eyebrow}</span>
            </div>
            <h2 className="mt-5 font-serif text-2xl font-semibold">{title}</h2>
            <p className="mt-2 text-[0.9375rem] leading-relaxed text-charcoal/85">{description}</p>
            <p className="mt-1 text-sm text-muted">{who}</p>
            <ul className="mt-4 flex-1 space-y-2 text-sm">
              {points.map((p) => (
                <li key={p} className="flex gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> {p}
                </li>
              ))}
            </ul>
            <ButtonLink to={to} size="lg" className="mt-6 w-full">
              {cta}
            </ButtonLink>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** /register/retailer and /register/supplier */
export function RegisterPage() {
  const { user } = useAuth();
  const after = useAfterAuth();
  const { portal } = useParams();
  // Set when this page's own form just created the account, so the brief moment before the
  // dashboard loads shows progress instead of the "already signed in" notice.
  const [registered, setRegistered] = useState(false);
  if (portal !== 'retailer' && portal !== 'supplier') return <Navigate to="/register" replace />;
  if (user && registered) {
    return (
      <AuthShell title="Account created" subtitle="Welcome to Dhaaga Bazaar.">
        <p className="text-sm text-muted">Opening your {portal} dashboard…</p>
      </AuthShell>
    );
  }
  if (user) {
    return (
      <AuthShell title={portal === 'supplier' ? 'Supplier registration' : 'Retailer registration'} subtitle="You're already signed in.">
        <SignedInNotice compact />
      </AuthShell>
    );
  }
  return (
    <AuthShell
      title={portal === 'supplier' ? 'Supplier registration' : 'Retailer registration'}
      subtitle={
        <>
          Already registered?{' '}
          <Link to="/login" className="link">
            Sign in
          </Link>
          {' · '}
          <Link to={portal === 'supplier' ? '/register/retailer' : '/register/supplier'} className="link">
            {portal === 'supplier' ? 'Register as a retailer instead' : 'Register as a supplier instead'}
          </Link>
        </>
      }
    >
      <RegisterForm
        key={portal}
        portal={portal}
        onSuccess={(u) => {
          setRegistered(true);
          after(u);
        }}
      />
    </AuthShell>
  );
}

export function ForgotPasswordPage() {
  return (
    <AuthShell title="Reset your password" subtitle="We'll email you a secure link to choose a new password.">
      <ForgotPasswordForm />
    </AuthShell>
  );
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<z.infer<typeof resetPasswordSchema>>({ resolver: zodResolver(resetPasswordSchema), defaultValues: { token } });
  return (
    <AuthShell title="Choose a new password" subtitle="For your security, you'll be signed out of all devices.">
      {done ? (
        <div className="space-y-4">
          <Alert tone="success">Your password has been updated. Please sign in with your new password.</Alert>
          <ButtonLink to="/login" className="w-full">
            Sign in
          </ButtonLink>
        </div>
      ) : !token ? (
        <Alert tone="danger">This reset link is incomplete. Please request a new one from the sign-in page.</Alert>
      ) : (
        <form
          className="space-y-4"
          onSubmit={form.handleSubmit(async (v) => {
            setError(null);
            try {
              await api.post('/auth/reset-password', v);
              setDone(true);
            } catch (e) {
              setError(errorMessage(e));
            }
          })}
          noValidate
        >
          {error && <Alert tone="danger">{error}</Alert>}
          <Input label="New password" type="password" autoComplete="new-password" hint="8+ characters with a letter and a number" error={form.formState.errors.password?.message} {...form.register('password')} />
          <Button type="submit" className="w-full" size="lg" loading={form.formState.isSubmitting}>
            Update password
          </Button>
        </form>
      )}
    </AuthShell>
  );
}

function AlreadySignedIn() {
  return (
    <div className="container-page py-12">
      <SignedInNotice />
    </div>
  );
}
