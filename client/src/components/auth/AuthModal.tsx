import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Lock } from 'lucide-react';
import { Modal } from '@/components/ui/Overlay';
import { useUi } from '@/stores/ui';
import { ForgotPasswordForm, LoginForm, RegisterForm } from './AuthForms';
import { cn } from '@/lib/utils';
import type { SessionUser } from '@/lib/types';
import { homeFor, useAuth } from '@/hooks/useAuth';
import { executeAction } from '@/hooks/useCommerce';
import { errorMessage } from '@/lib/api';
import { toast } from '@/stores/ui';

/** The "Sign in to continue" dialog shown when a guest attempts a commerce action. */
export function AuthModal() {
  const { open, mode, reason } = useUi((s) => s.authModal);
  const close = useUi((s) => s.closeAuth);
  const setMode = useUi((s) => s.setAuthMode);
  const pending = useUi((s) => s.pendingAction);
  const clearPending = useUi((s) => s.clearPendingAction);
  const navigate = useNavigate();
  const [forgot, setForgot] = useState(false);

  useEffect(() => {
    if (open) setForgot(false);
  }, [open]);

  const onClose = () => {
    close();
    clearPending(); // the guest dismissed the prompt: forget the attempted action
  };

  const onSuccess = (user: SessionUser) => {
    close();
    // Suppliers and admins work from their portals; retailer actions are replayed by <PendingActionRunner />.
    if (user.role !== 'RETAILER') navigate(homeFor(user));
    // Retailer pending actions are replayed by <PendingActionRunner />.
  };

  return (
    <Modal open={open} onClose={onClose} labelledBy="auth-title" className="sm:max-w-xl">
      <div className="bg-textile px-6 pt-7 pb-5 sm:px-8">
        <div className="flex items-center gap-2 text-copper-500">
          <Lock className="size-4" aria-hidden />
          <span className="text-xs font-semibold tracking-[0.25em] uppercase">{pending ? 'Sign in to continue' : 'Welcome to Dhaaga Bazaar'}</span>
        </div>
        <h2 id="auth-title" className="mt-2 font-serif text-2xl font-semibold text-brand-900">
          {forgot ? 'Reset your password' : mode === 'login' ? 'Sign in to continue' : 'Create your business account'}
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          {reason ?? 'Create your Dhaaga Bazaar account to request wholesale orders and manage your purchases.'}
        </p>
        {!forgot && (
          <div className="mt-5 grid grid-cols-2 rounded-lg bg-white/70 p-1 text-sm font-medium" role="tablist">
            {(['login', 'register'] as const).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                className={cn('rounded-md py-2 transition-colors', mode === m ? 'bg-brand-900 text-white shadow-sm' : 'text-brand-900 hover:bg-white')}
              >
                {m === 'login' ? 'Sign in' : 'Create account'}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="px-6 py-6 sm:px-8">
        {forgot ? <ForgotPasswordForm onBack={() => setForgot(false)} /> : mode === 'login' ? (
          <LoginForm onSuccess={onSuccess} onForgot={() => setForgot(true)} />
        ) : (
          <>
            <p className="mb-4 rounded-lg bg-brand-50 px-4 py-3 text-sm text-muted">
              Registering a retailer account.{' '}
              <Link to="/register/supplier" onClick={onClose} className="link">
                Are you a supplier? Register here
              </Link>
            </p>
            <RegisterForm portal="retailer" onSuccess={onSuccess} />
          </>
        )}
        {!forgot && <p className="mt-5 text-center text-xs text-muted">You can keep browsing without an account. Sign-in is only needed to order, save or enquire.</p>}
      </div>
    </Modal>
  );
}

/**
 * After any successful sign-in (modal or full page), replays the commerce
 * action the visitor originally attempted — e.g. adds the product to the cart.
 */
export function PendingActionRunner() {
  const { user } = useAuth();
  const pending = useUi((s) => s.pendingAction);
  const take = useUi((s) => s.takePendingAction);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const running = useRef(false);

  useEffect(() => {
    if (!user || !pending || running.current) return;
    if (user.role !== 'RETAILER') {
      take();
      if (pending.type !== 'navigate') {
        toast({ tone: 'info', title: 'Retailer account required', description: 'Ordering and saving are available to retailer accounts.' });
      }
      return;
    }
    running.current = true;
    const action = take();
    if (!action) {
      running.current = false;
      return;
    }
    if (action.type === 'navigate') {
      navigate(action.to);
      running.current = false;
      return;
    }
    executeAction(action, qc)
      .catch((e) => toast({ tone: 'error', title: 'We could not complete your earlier action', description: errorMessage(e) }))
      .finally(() => {
        running.current = false;
      });
  }, [user, pending, take, qc, navigate]);

  return null;
}
