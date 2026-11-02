import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const control =
  'w-full rounded-md border border-line-strong bg-white px-3.5 text-[0.9375rem] text-charcoal placeholder:text-muted/70 transition-colors focus:border-copper-500 focus:outline-none focus:ring-2 focus:ring-copper-500/20 disabled:bg-brand-50 disabled:text-muted aria-[invalid=true]:border-danger aria-[invalid=true]:focus:ring-danger/15';

interface FieldWrapProps {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  id: string;
  children: ReactNode;
  className?: string;
}

export function FieldWrap({ label, hint, error, required, id, children, className }: FieldWrapProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-charcoal">
          {label}
          {required && <span className="ml-0.5 text-copper-500" aria-hidden>*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-[0.8125rem] text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-[0.8125rem] text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { label?: ReactNode; hint?: ReactNode; error?: string; wrapClassName?: string; leading?: ReactNode; trailing?: ReactNode };

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ label, hint, error, wrapClassName, className, id, required, leading, trailing, ...rest }, ref) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <FieldWrap label={label} hint={hint} error={error} required={required} id={fid} className={wrapClassName}>
      <div className="relative">
        {leading && <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted">{leading}</span>}
        <input
          ref={ref}
          id={fid}
          required={required}
          aria-invalid={!!error || undefined}
          aria-describedby={error ? `${fid}-error` : hint ? `${fid}-hint` : undefined}
          className={cn(control, 'h-11', leading && 'pl-10', trailing && 'pr-11', className)}
          {...rest}
        />
        {trailing && <span className="absolute inset-y-0 right-1.5 flex items-center">{trailing}</span>}
      </div>
    </FieldWrap>
  );
});

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: ReactNode; hint?: ReactNode; error?: string; wrapClassName?: string };

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea({ label, hint, error, wrapClassName, className, id, required, ...rest }, ref) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <FieldWrap label={label} hint={hint} error={error} required={required} id={fid} className={wrapClassName}>
      <textarea
        ref={ref}
        id={fid}
        required={required}
        aria-invalid={!!error || undefined}
        className={cn(control, 'min-h-28 py-2.5 leading-relaxed', className)}
        {...rest}
      />
    </FieldWrap>
  );
});

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { label?: ReactNode; hint?: ReactNode; error?: string; wrapClassName?: string };

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({ label, hint, error, wrapClassName, className, id, required, children, ...rest }, ref) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <FieldWrap label={label} hint={hint} error={error} required={required} id={fid} className={wrapClassName}>
      <select
        ref={ref}
        id={fid}
        required={required}
        aria-invalid={!!error || undefined}
        className={cn(control, 'h-11 cursor-pointer appearance-none bg-[url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 20 20%27 fill=%27%236e6056%27%3E%3Cpath d=%27M5.5 7.5 10 12l4.5-4.5%27 stroke=%27%236e6056%27 stroke-width=%271.5%27 fill=%27none%27/%3E%3C/svg%3E")] bg-[length:1.1rem] bg-[right_0.75rem_center] bg-no-repeat pr-10', className)}
        {...rest}
      >
        {children}
      </select>
    </FieldWrap>
  );
});

export function Checkbox({ label, description, className, disabled, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; description?: ReactNode }) {
  return (
    <label className={cn('flex cursor-pointer items-start gap-2.5 text-sm', disabled && 'cursor-not-allowed opacity-50', className)}>
      <input type="checkbox" disabled={disabled} className="mt-0.5 size-4 shrink-0 cursor-pointer rounded-sm border-line-strong accent-copper-500" {...rest} />
      <span className="min-w-0">
        <span className="text-charcoal">{label}</span>
        {description && <span className="block text-xs text-muted">{description}</span>}
      </span>
    </label>
  );
}
