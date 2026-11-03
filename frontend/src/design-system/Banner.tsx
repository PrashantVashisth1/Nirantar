import { AlertCircle, CheckCircle2, Info, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import type { Tone } from './Badge';

const STYLES: Record<Tone, { box: string; Icon: typeof Info }> = {
  info: { box: 'bg-info-bg text-info', Icon: Info },
  warning: { box: 'bg-warning-bg text-warning', Icon: TriangleAlert },
  success: { box: 'bg-success-bg text-success', Icon: CheckCircle2 },
  danger: { box: 'bg-danger-bg text-danger', Icon: AlertCircle },
  neutral: { box: 'bg-sunken text-ink-2', Icon: Info },
};

/** An inline message. Errors are announced to screen readers immediately. */
export function Banner({
  tone = 'info',
  title,
  children,
  action,
  className,
}: {
  tone?: Tone;
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const { box, Icon } = STYLES[tone];
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn('flex items-start gap-3 rounded-md px-4 py-3', box, className)}
    >
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        {title && <p className="text-body font-semibold">{title}</p>}
        {children && <div className="text-body text-ink">{children}</div>}
      </div>
      {action}
    </div>
  );
}
