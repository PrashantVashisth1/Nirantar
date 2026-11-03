import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router';
import { cn } from '../lib/cn';
import { Spinner } from './Spinner';

type Variant = 'primary' | 'secondary' | 'quiet' | 'danger';
/** xl/lg for customer screens (56/48 px), md/sm for staff screens (36/30 px). */
type Size = 'xl' | 'lg' | 'md' | 'sm';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-pine text-white hover:bg-pine-hover active:bg-pine-pressed disabled:bg-disabled disabled:text-ink-disabled',
  secondary:
    'border border-line-strong bg-surface text-ink hover:bg-sunken active:bg-line disabled:text-ink-disabled',
  quiet: 'text-pine hover:bg-sunken active:bg-line disabled:text-ink-disabled',
  danger: 'border border-danger/40 bg-surface text-danger hover:bg-danger-bg disabled:text-ink-disabled',
};

const SIZES: Record<Size, string> = {
  // min-height (not fixed height): Hindi and Bengali labels can be ~30% longer and must wrap cleanly.
  xl: 'min-h-14 rounded-md px-6 py-3 text-center text-body-lg',
  lg: 'min-h-12 rounded-md px-5 py-2 text-center text-body-lg',
  md: 'h-9 rounded-sm px-3.5 text-staff-body',
  sm: 'h-[30px] rounded-sm px-2.5 text-staff-table',
};

function buttonClasses(variant: Variant, size: Size, fullWidth?: boolean, className?: string) {
  return cn(
    'inline-flex shrink-0 select-none items-center justify-center gap-2 font-medium',
    'transition-colors duration-120 ease-calm disabled:cursor-not-allowed',
    VARIANTS[variant],
    SIZES[size],
    fullWidth && 'w-full',
    className,
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  /** Shows a spinner, keeps the label, and blocks double submits. */
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'lg', fullWidth, loading, icon, disabled, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClasses(variant, size, fullWidth, className)}
      {...rest}
    >
      {loading ? <Spinner className={size === 'sm' || size === 'md' ? 'size-4' : 'size-5'} /> : icon}
      {children}
    </button>
  );
});

export interface ButtonLinkProps extends LinkProps {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  icon?: ReactNode;
}

/** Navigation that looks like a button. It's a real link, so it's never nested inside a <button>. */
export function ButtonLink({ variant = 'primary', size = 'lg', fullWidth, icon, className, children, ...rest }: ButtonLinkProps) {
  return (
    <Link className={buttonClasses(variant, size, fullWidth, className as string | undefined)} {...rest}>
      {icon}
      {children}
    </Link>
  );
}
