import type { OrderStatus, Schedule } from '@nirantar/shared';
import { useTranslation } from 'react-i18next';
import { cn } from '../lib/cn';

export type Tone = 'info' | 'warning' | 'success' | 'danger' | 'neutral';

const TONES: Record<Tone, { pill: string; dot: string }> = {
  info: { pill: 'bg-info-bg text-info', dot: 'bg-info' },
  warning: { pill: 'bg-warning-bg text-warning', dot: 'bg-warning' },
  success: { pill: 'bg-success-bg text-success', dot: 'bg-success' },
  danger: { pill: 'bg-danger-bg text-danger', dot: 'bg-danger' },
  neutral: { pill: 'bg-sunken text-ink-2', dot: 'bg-ink-3' },
};

/**
 * Customer tone for each status (plan §3.1). Waiting on the pharmacist is
 * "info", never red; red only for things that actually failed.
 */
export const CUSTOMER_STATUS_TONE: Record<OrderStatus, Tone> = {
  AWAITING_PHARMACIST: 'info',
  ON_HOLD_REUPLOAD: 'warning',
  AWAITING_CUSTOMER: 'warning',
  APPROVED: 'success',
  AWAITING_STOCK: 'warning',
  ASSIGNED: 'info',
  PICKING: 'info',
  PACKED: 'info',
  OUT_FOR_DELIVERY: 'info',
  DELIVERED: 'success',
  REJECTED: 'danger',
  CANCELLED: 'neutral',
};

export function Pill({
  tone,
  children,
  size = 'customer',
}: {
  tone: Tone;
  children: React.ReactNode;
  size?: 'customer' | 'staff';
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 whitespace-nowrap rounded-full font-medium',
        size === 'customer' ? 'h-7 px-3 text-caption' : 'h-6 px-2.5 text-staff-caption',
        TONES[tone].pill,
      )}
    >
      <span className={cn('size-1.5 rounded-full', TONES[tone].dot)} aria-hidden />
      {children}
    </span>
  );
}

/** An order status in plain customer language ("Pharmacist is checking"). */
export function StatusPill({ status }: { status: OrderStatus }) {
  const { t } = useTranslation();
  return <Pill tone={CUSTOMER_STATUS_TONE[status]}>{t(`status.${status}`)}</Pill>;
}

const SCHEDULE_STYLES: Record<Schedule, { label: string; className: string }> = {
  OTC: { label: 'OTC', className: 'border border-line-strong text-ink-2' },
  H: { label: 'H · Rx', className: 'border border-ink text-ink' },
  H1: { label: 'H1', className: 'bg-ink text-white' },
  X: { label: 'X · Not sold online', className: 'bg-danger text-white' },
  NDPS: { label: 'NDPS · Not sold online', className: 'bg-danger text-white' },
};

/** Schedule tag used on staff screens. */
export function ScheduleTag({ schedule }: { schedule: Schedule }) {
  const style = SCHEDULE_STYLES[schedule];
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center rounded-xs px-1.5 text-staff-caption font-semibold tracking-[0.02em]',
        style.className,
      )}
    >
      {style.label}
    </span>
  );
}
