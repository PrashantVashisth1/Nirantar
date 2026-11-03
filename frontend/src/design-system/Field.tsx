import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { AlertCircle, ChevronDown } from 'lucide-react';
import { cn } from '../lib/cn';

interface FieldShellProps {
  label: string;
  hint?: string;
  error?: string;
  /** "customer" = 52 px / 18 px text; "staff" = 36 px / 15 px text. */
  density?: 'customer' | 'staff';
  children: (ids: { inputId: string; describedBy: string | undefined }) => ReactNode;
}

/** Label always above the control, hint or error below (never placeholder-only labels). */
export function FieldShell({ label, hint, error, density = 'customer', children }: FieldShellProps) {
  const inputId = useId();
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={inputId}
        className={cn('font-medium text-ink', density === 'customer' ? 'text-body' : 'text-staff-table')}
      >
        {label}
      </label>
      {children({ inputId, describedBy })}
      {hint && !error && (
        <p id={hintId} className={cn('text-ink-2', density === 'customer' ? 'text-caption' : 'text-staff-caption')}>
          {hint}
        </p>
      )}
      {error && (
        <p
          id={errorId}
          className={cn('flex items-start gap-1.5 text-danger', density === 'customer' ? 'text-caption' : 'text-staff-caption')}
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      )}
    </div>
  );
}

const controlClasses = (density: 'customer' | 'staff', hasError: boolean) =>
  cn(
    'w-full border bg-surface text-ink placeholder:text-ink-3',
    'transition-[border-color,box-shadow] duration-120 ease-calm',
    'focus:border-pine focus:outline-none focus:ring-3 focus:ring-pine-subtle',
    'disabled:bg-sunken disabled:text-ink-disabled',
    density === 'customer' ? 'h-[52px] rounded-md px-4 text-body-lg' : 'h-9 rounded-sm px-3 text-staff-body',
    hasError ? 'border-danger' : 'border-line-strong',
  );

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label: string;
  hint?: string;
  error?: string;
  density?: 'customer' | 'staff';
  prefix?: string;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, error, density = 'customer', prefix, className, ...rest },
  ref,
) {
  return (
    <FieldShell label={label} hint={hint} error={error} density={density}>
      {({ inputId, describedBy }) => (
        <div className="relative">
          {prefix && (
            <span
              className={cn(
                'pointer-events-none absolute inset-y-0 left-0 flex items-center text-ink-2',
                density === 'customer' ? 'pl-4 text-body-lg' : 'pl-3 text-staff-body',
              )}
            >
              {prefix}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className={cn(controlClasses(density, Boolean(error)), prefix && (density === 'customer' ? 'pl-14' : 'pl-11'), className)}
            {...rest}
          />
        </div>
      )}
    </FieldShell>
  );
});

export interface SelectFieldProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  label: string;
  hint?: string;
  error?: string;
  density?: 'customer' | 'staff';
  options: { value: string; label: string }[];
}

/** Native select: the most reliable and familiar control on low-end Android phones. */
export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(function SelectField(
  { label, hint, error, density = 'customer', options, className, ...rest },
  ref,
) {
  return (
    <FieldShell label={label} hint={hint} error={error} density={density}>
      {({ inputId, describedBy }) => (
        <div className="relative">
          <select
            ref={ref}
            id={inputId}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className={cn(controlClasses(density, Boolean(error)), 'appearance-none pr-11', className)}
            {...rest}
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-4 top-1/2 size-5 -translate-y-1/2 text-ink-2" aria-hidden />
        </div>
      )}
    </FieldShell>
  );
});

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode;
  error?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, error, className, id, ...rest },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <div className={className}>
      <label htmlFor={inputId} className="flex cursor-pointer items-start gap-3 py-1">
        <input
          ref={ref}
          id={inputId}
          type="checkbox"
          aria-invalid={error ? true : undefined}
          className="mt-0.5 size-[22px] shrink-0 cursor-pointer accent-pine"
          {...rest}
        />
        <span className="text-body text-ink">{label}</span>
      </label>
      {error && <p className="ml-[34px] mt-1 text-caption text-danger">{error}</p>}
    </div>
  );
});
