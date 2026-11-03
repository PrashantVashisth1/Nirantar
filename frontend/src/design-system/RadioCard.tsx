import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

/**
 * A large, tappable radio option (patient, payment method). Uses a real radio
 * input, so keyboard and screen readers work as expected.
 */
export function RadioCard({
  name,
  value,
  checked,
  onChange,
  title,
  description,
  compact = false,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: (value: string) => void;
  title: ReactNode;
  description?: ReactNode;
  /** For short options side by side (e.g. languages): centred text, no check circle. */
  compact?: boolean;
}) {
  return (
    <label
      className={cn(
        'flex min-h-14 cursor-pointer items-center gap-3 rounded-md border py-3 transition-colors duration-120',
        'has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-pine',
        compact ? 'justify-center px-2 text-center' : 'px-4',
        checked
          ? cn('border-2 border-pine bg-pine-subtle py-2.75', compact ? 'px-1.75' : 'px-3.75')
          : 'border-line-strong bg-surface hover:bg-sunken',
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={() => onChange(value)}
        className="sr-only"
      />
      <span className={cn('min-w-0', !compact && 'flex-1')}>
        <span
          className={cn('block text-body-lg text-ink', checked || !compact ? 'font-medium' : '')}
        >
          {title}
        </span>
        {description && <span className="block text-caption text-ink-2">{description}</span>}
      </span>
      {!compact && (
        <span
          className={cn(
            'grid size-6 shrink-0 place-items-center rounded-full border',
            checked ? 'border-pine bg-pine text-white' : 'border-line-strong bg-surface',
          )}
          aria-hidden
        >
          {checked && <Check className="size-4" strokeWidth={2.5} />}
        </span>
      )}
    </label>
  );
}
