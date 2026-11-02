import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'copper' | 'outline' | 'ghost' | 'subtle' | 'danger' | 'link';
type Size = 'sm' | 'md' | 'lg';

const base =
  'inline-flex items-center justify-center gap-2 font-medium whitespace-nowrap transition-colors duration-150 disabled:pointer-events-none disabled:opacity-55 select-none';
const variants: Record<Variant, string> = {
  primary: 'bg-brand-900 text-white hover:bg-brand-800 active:bg-brand-950 shadow-sm',
  copper: 'bg-copper-500 text-white hover:bg-copper-600 active:bg-copper-700 shadow-sm',
  outline: 'border border-brand-900/80 bg-transparent text-brand-900 hover:bg-brand-900 hover:text-white',
  ghost: 'text-brand-900 hover:bg-brand-100',
  subtle: 'border border-line bg-white text-charcoal hover:border-line-strong hover:bg-brand-50',
  danger: 'bg-danger text-white hover:bg-[#87231a]',
  link: 'text-copper-500 hover:text-copper-600 underline-offset-4 hover:underline px-0',
};
const sizes: Record<Size, string> = {
  sm: 'h-9 px-3.5 text-sm rounded-md',
  md: 'h-11 px-5 text-[0.9375rem] rounded-md',
  lg: 'h-12 px-7 text-base rounded-md',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(base, variants[variant], variant !== 'link' && sizes[size], variant === 'link' && 'text-sm', className)}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

export function ButtonLink({
  variant = 'primary',
  size = 'md',
  className,
  icon,
  children,
  ...rest
}: LinkProps & { variant?: Variant; size?: Size; icon?: ReactNode }) {
  return (
    <Link className={cn(base, variants[variant], variant !== 'link' && sizes[size], className)} {...rest}>
      {icon}
      {children}
    </Link>
  );
}
