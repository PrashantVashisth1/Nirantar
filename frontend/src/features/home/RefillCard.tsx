import type { RefillDto } from '@nirantar/shared';
import { ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { ButtonLink } from '../../design-system/Button';
import { cn } from '../../lib/cn';
import { formatCalendarDate } from '../../lib/format';

/**
 * The one raised card on Home: medicines a person needs soon, how long they
 * have left, and the single action that matters (plan C2).
 */
export function RefillCard({ refills }: { refills: RefillDto[] }) {
  const { t } = useTranslation();
  const patient = refills[0]!.patient;

  const needsAction = refills.filter((r) => !r.orderInProgress);
  const inProgress = refills.find((r) => r.orderInProgress)?.orderInProgress ?? null;
  const prescriptionExpired = needsAction.some((r) => !r.prescriptionValid);

  return (
    <article className="rounded-md bg-surface p-5 shadow-raised">
      <p className="text-caption font-medium uppercase tracking-wide text-ink-3">
        {patient.relation === 'SELF' ? t('home.forYou') : t('home.forPatient', { name: patient.fullName })}
      </p>

      <ul className="mt-3 flex flex-col gap-4">
        {refills.map((refill) => (
          <RefillLine key={refill.id} refill={refill} />
        ))}
      </ul>

      <div className="mt-5">
        {needsAction.length === 0 && inProgress ? (
          <Link
            to={`/orders/${inProgress.id}`}
            className="flex min-h-12 items-center justify-between rounded-md bg-pine-subtle px-4 text-body font-medium text-pine"
          >
            {t('home.reorderInProgress', { number: inProgress.number })}
            <ChevronRight className="size-5" aria-hidden />
          </Link>
        ) : prescriptionExpired ? (
          <>
            <p className="mb-3 text-body text-ink-2">{t('home.prescriptionExpired')}</p>
            <ButtonLink to={`/order/new?patient=${patient.id}`} variant="secondary" size="xl" fullWidth>
              {t('home.uploadNewToReorder')}
            </ButtonLink>
          </>
        ) : (
          <ButtonLink
            to={`/order/new?refill=${needsAction.map((r) => r.id).join(',')}`}
            size="xl"
            fullWidth
          >
            {t('home.reorderCount', { count: needsAction.length })}
          </ButtonLink>
        )}
      </div>
    </article>
  );
}

function RefillLine({ refill }: { refill: RefillDto }) {
  const { t, i18n } = useTranslation();
  const left = Math.max(0, refill.daysLeft);
  const share = Math.min(1, left / Math.max(1, refill.daysSupply));
  const urgent = refill.daysLeft <= 2;

  // Non-breaking spaces keep a date like "Sun, 8 Nov" on one line.
  const date = formatCalendarDate(refill.runOutOn, i18n.language).replace(/ /g, ' ');
  const when =
    refill.daysLeft < 0
      ? t('home.ranOut', { date })
      : refill.daysLeft === 0
        ? t('home.runsOutToday')
        : t('home.runsOutAround', { date });

  return (
    <li>
      <p className="text-heading font-semibold text-ink">{refill.product.displayName}</p>
      <p className="text-body text-ink-2">
        {refill.product.brandName} · {refill.product.packLabel}
      </p>
      {/* Supply line: days left out of the days the last fill was meant to last. */}
      <div
        className="mt-3 h-1.5 overflow-hidden rounded-full bg-sunken"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={refill.daysSupply}
        aria-valuenow={left}
        aria-label={t('home.daysLeft', { count: left })}
      >
        <div
          className={cn('h-full rounded-full', urgent ? 'bg-warning' : 'bg-pine')}
          style={{ width: `${Math.max(share * 100, left > 0 ? 4 : 0)}%` }}
        />
      </div>
      <p className="mt-2 text-body text-ink-2">
        {refill.daysLeft > 0 && (
          <span className={cn('font-semibold', urgent ? 'text-warning' : 'text-ink')}>
            {t('home.daysLeft', { count: refill.daysLeft })} ·{' '}
          </span>
        )}
        {when}
      </p>
    </li>
  );
}
