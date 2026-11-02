import { useState } from 'react';
import { Controller, useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { BUSINESS_TYPES, INDIAN_STATES, SUPPLIER_BUSINESS_TYPES, type BusinessType, forgotPasswordSchema, loginSchema, registerSchema, type LoginInput, type RegisterInput } from '@dhaaga/shared';
import { Button } from '@/components/ui/Button';
import { Checkbox, Input, Select, Textarea } from '@/components/ui/Field';
import { useCategories } from '@/lib/categories';
import { Alert } from '@/components/ui/Feedback';
import { useAuth } from '@/hooks/useAuth';
import { api, ApiError, errorMessage } from '@/lib/api';
import type { SessionUser } from '@/lib/types';
import { cn } from '@/lib/utils';
import { z } from 'zod';

export function PasswordInput(props: React.ComponentProps<typeof Input>) {
  const [show, setShow] = useState(false);
  return (
    <Input
      {...props}
      type={show ? 'text' : 'password'}
      trailing={
        <button type="button" onClick={() => setShow((s) => !s)} className="rounded p-1.5 text-muted hover:text-charcoal" aria-label={show ? 'Hide password' : 'Show password'}>
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      }
    />
  );
}

export function LoginForm({ onSuccess, onForgot }: { onSuccess: (u: SessionUser) => void; onForgot?: () => void }) {
  const { login } = useAuth();
  const { register, handleSubmit, formState } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });
  return (
    <form onSubmit={handleSubmit((v) => login.mutate(v, { onSuccess: ({ user }) => onSuccess(user) }))} className="space-y-4" noValidate>
      {login.error && <Alert tone="danger">{errorMessage(login.error)}</Alert>}
      <Input label="Email address" type="email" autoComplete="email" data-autofocus error={formState.errors.email?.message} {...register('email')} />
      <PasswordInput label="Password" autoComplete="current-password" error={formState.errors.password?.message} {...register('password')} />
      <div className="flex justify-end">
        {onForgot ? (
          <button type="button" onClick={onForgot} className="link text-sm">
            Forgot password?
          </button>
        ) : (
          <Link to="/forgot-password" className="link text-sm">
            Forgot password?
          </Link>
        )}
      </div>
      <Button type="submit" className="w-full" size="lg" loading={login.isPending}>
        Sign in
      </Button>
    </form>
  );
}

export type Portal = 'retailer' | 'supplier';

/** Category chips: retailers pick broad interests, suppliers pick the subcategories they supply. */
function CategoryPicker({ value, onChange, portal, error }: { value: string[]; onChange: (v: string[]) => void; portal: Portal; error?: string }) {
  const cats = useCategories();
  const toggle = (path: string) => onChange(value.includes(path) ? value.filter((p) => p !== path) : [...value, path]);
  const chip = (path: string, label: string) => (
    <button
      type="button"
      key={path}
      aria-pressed={value.includes(path)}
      onClick={() => toggle(path)}
      className={cn('rounded-full border px-3 py-1 text-xs font-medium', value.includes(path) ? 'border-copper-500 bg-copper-500 text-white' : 'border-line-strong bg-white hover:border-copper-400')}
    >
      {label}
    </button>
  );
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-charcoal">
        {portal === 'supplier' ? 'Product categories you supply' : 'Interested product categories (optional)'}
        {portal === 'supplier' && <span className="ml-0.5 text-copper-500">*</span>}
      </legend>
      {portal === 'retailer' ? (
        <div className="flex flex-wrap gap-1.5">{cats.roots.map((r) => chip(r.path, r.name))}</div>
      ) : (
        <div className="max-h-64 space-y-3 overflow-y-auto rounded-lg border border-line p-3">
          {cats.roots.map((r) => (
            <div key={r.path}>
              <div className="mb-1.5 text-xs font-semibold tracking-wide text-muted uppercase">{r.name}</div>
              <div className="flex flex-wrap gap-1.5">{cats.children(r.path).map((c) => chip(c.path, c.name))}</div>
            </div>
          ))}
        </div>
      )}
      {error && <p className="mt-1.5 text-[0.8125rem] text-danger">{error}</p>}
    </fieldset>
  );
}

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <h3 className="border-b border-line pb-1.5 text-xs font-semibold tracking-[0.18em] text-copper-600 uppercase">{children}</h3>
);

/**
 * Registration for either portal. Both create a real account in PostgreSQL;
 * suppliers go to admin review, retailers can order immediately.
 */
type RegisterValues = z.input<typeof registerSchema>;
const baseRegisterResolver = zodResolver(registerSchema);
/**
 * Zod skips cross-field checks until every other field is valid. Run them
 * always, so password mismatch and supplier-only requirements are shown together
 * with the other errors instead of one round later.
 */
const registerResolver: Resolver<RegisterValues, unknown, RegisterInput> = async (values, ctx, options) => {
  const result = await baseRegisterResolver(values, ctx, options);
  const errors = { ...result.errors } as Record<string, { type: string; message: string }>;
  if (values.confirmPassword !== undefined && values.password !== values.confirmPassword && !errors.confirmPassword) {
    errors.confirmPassword = { type: 'custom', message: 'Passwords do not match' };
  }
  if (SUPPLIER_BUSINESS_TYPES.includes(values.businessType as BusinessType)) {
    if (!values.categoryPaths?.length && !errors.categoryPaths) errors.categoryPaths = { type: 'custom', message: 'Choose at least one category you supply' };
    if ((values.description ?? '').trim().length < 20 && !errors.description) errors.description = { type: 'custom', message: 'Describe your business (min. 20 characters)' };
  }
  return Object.keys(errors).length ? { values: {}, errors: errors as never } : result;
};

export function RegisterForm({ portal, onSuccess }: { portal: Portal; onSuccess: (u: SessionUser) => void }) {
  const { register: signup } = useAuth();
  const types = BUSINESS_TYPES.filter((b) => b.side === (portal === 'supplier' ? 'supplier' : 'buyer'));
  const { register, handleSubmit, formState, watch, setValue, setError, control } = useForm<z.input<typeof registerSchema>, unknown, RegisterInput>({
    resolver: registerResolver,
    defaultValues: { businessType: types[0].value, city: '', categoryPaths: [] },
  });
  const businessType = watch('businessType');
  const e = formState.errors;
  return (
    <form
      onSubmit={handleSubmit((v) =>
        signup.mutate(v, {
          onSuccess: ({ user }) => onSuccess(user),
          onError: (err) => {
            if (err instanceof ApiError && err.details) {
              for (const [k, msgs] of Object.entries(err.details)) if (msgs?.[0]) setError(k as keyof RegisterInput, { message: msgs[0] });
            }
          },
        }),
      )}
      className="space-y-5"
      noValidate
    >
      {signup.error && <Alert tone="danger">{errorMessage(signup.error)}</Alert>}

      <SectionTitle>Your account</SectionTitle>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Full name" autoComplete="name" required error={e.fullName?.message} {...register('fullName')} />
        <Input label="Email address" type="email" autoComplete="email" required error={e.email?.message} {...register('email')} />
        <Input label="Mobile number" type="tel" inputMode="tel" autoComplete="tel" placeholder="10-digit mobile" required error={e.phone?.message} {...register('phone')} />
        <div className="hidden sm:block" />
        <PasswordInput label="Password" autoComplete="new-password" hint="8+ characters with a letter and a number" required error={e.password?.message} {...register('password')} />
        <PasswordInput label="Confirm password" autoComplete="new-password" required error={e.confirmPassword?.message} {...register('confirmPassword')} />
      </div>

      <SectionTitle>{portal === 'supplier' ? 'Your business' : 'Your shop'}</SectionTitle>
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-charcoal">
          Business type<span className="ml-0.5 text-copper-500">*</span>
        </legend>
        <div className="grid grid-cols-3 gap-2">
          {types.map((b) => (
            <button
              type="button"
              key={b.value}
              onClick={() => setValue('businessType', b.value, { shouldValidate: true })}
              aria-pressed={businessType === b.value}
              className={cn(
                'rounded-md border px-3 py-2.5 text-left text-sm transition-colors',
                businessType === b.value ? 'border-copper-500 bg-copper-50 font-semibold text-copper-700' : 'border-line-strong bg-white text-charcoal hover:border-copper-400',
              )}
            >
              {b.label}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label={portal === 'supplier' ? 'Business name' : 'Shop / business name'} autoComplete="organization" required error={e.businessName?.message} {...register('businessName')} />
        <Input label={portal === 'supplier' ? 'GSTIN (where applicable)' : 'GSTIN (optional)'} placeholder="15-character GSTIN" error={e.gstin?.message} {...register('gstin')} />
        <Input label={portal === 'supplier' ? 'Business address' : 'Shop address'} autoComplete="street-address" required wrapClassName="sm:col-span-2" error={e.addressLine?.message} {...register('addressLine')} />
        <Input label="City" autoComplete="address-level2" required error={e.city?.message} {...register('city')} />
        <Select label="State" required error={e.state?.message} {...register('state')} defaultValue="">
          <option value="" disabled>
            Select state
          </option>
          {INDIAN_STATES.map((st) => (
            <option key={st}>{st}</option>
          ))}
        </Select>
        <Input label="PIN code" inputMode="numeric" autoComplete="postal-code" required error={e.pincode?.message} {...register('pincode')} />
      </div>
      <Controller
        control={control}
        name="categoryPaths"
        render={({ field }) => <CategoryPicker value={field.value ?? []} onChange={field.onChange} portal={portal} error={e.categoryPaths?.message} />}
      />
      {portal === 'supplier' && (
        <Textarea label="Business description" required hint="What you make or stock, specialities and production capacity (min. 20 characters)." error={e.description?.message} {...register('description')} />
      )}
      {portal === 'supplier' && (
        <Alert tone="info">Your supplier account will be reviewed by our team before your listings can go live. New suppliers are never marked verified automatically.</Alert>
      )}
      <Checkbox
        label={
          <>
            I agree to the{' '}
            <Link to="/terms" target="_blank" className="link">
              Terms
            </Link>{' '}
            and{' '}
            <Link to="/privacy" target="_blank" className="link">
              Privacy Policy
            </Link>
          </>
        }
        {...register('acceptTerms')}
      />
      {e.acceptTerms && <p className="-mt-3 text-[0.8125rem] text-danger">{e.acceptTerms.message}</p>}
      <Button type="submit" className="w-full" size="lg" loading={signup.isPending}>
        {portal === 'supplier' ? 'Register as a supplier' : 'Create retailer account'}
      </Button>
    </form>
  );
}

export function ForgotPasswordForm({ onBack }: { onBack?: () => void }) {
  const [sent, setSent] = useState<string | null>(null);
  const [error, setErr] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<z.infer<typeof forgotPasswordSchema>>({ resolver: zodResolver(forgotPasswordSchema) });
  if (sent) {
    return (
      <div className="space-y-4">
        <Alert tone="success">{sent}</Alert>
        {onBack && (
          <Button variant="subtle" className="w-full" onClick={onBack}>
            Back to sign in
          </Button>
        )}
      </div>
    );
  }
  return (
    <form
      onSubmit={handleSubmit(async (v) => {
        setErr(null);
        try {
          const r = await api.post<{ message: string }>('/auth/forgot-password', v);
          setSent(r.message);
        } catch (err) {
          setErr(errorMessage(err));
        }
      })}
      className="space-y-4"
      noValidate
    >
      <p className="text-sm text-muted">Enter the email address on your account and we&apos;ll send you a link to reset your password.</p>
      {error && <Alert tone="danger">{error}</Alert>}
      <Input label="Email address" type="email" autoComplete="email" data-autofocus error={formState.errors.email?.message} {...register('email')} />
      <Button type="submit" className="w-full" size="lg" loading={formState.isSubmitting}>
        Send reset link
      </Button>
      {onBack && (
        <button type="button" onClick={onBack} className="link block w-full text-center text-sm">
          Back to sign in
        </button>
      )}
    </form>
  );
}
