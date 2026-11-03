import { useQuery } from '@tanstack/react-query';
import { REFILL_DUE_SOON_DAYS, type HomeDto, type OrderSummaryDto, type RefillDto } from '@nirantar/shared';
import { Camera, ChevronDown, ChevronRight, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate } from 'react-router';
import { StatusPill } from '../../design-system/Badge';
import { ButtonLink } from '../../design-system/Button';
import { PrescriptionIllustration } from '../../design-system/Illustrations';
import { EmptyState, ErrorState, LoadingNote, Skeleton } from '../../design-system/States';
import { CustomerLayout } from '../../layouts/CustomerLayout';
import { api } from '../../lib/api';
import { useAppConfig } from '../../lib/config';
import { errorMessage } from '../../lib/errors';
import { firstName, formatCalendarDate, greetingKey } from '../../lib/format';
import { useMe } from '../../lib/session';
import { ALL_PATIENTS, FamilySheet } from './FamilySheet';
import { RefillCard } from './RefillCard';

const PATIENT_KEY = 'nirantar.patient';

function rememberedPatient(): string {
  try {
    return localStorage.getItem(PATIENT_KEY) ?? ALL_PATIENTS;
  } catch {
    return ALL_PATIENTS;
  }
}

/**
 * C2 Home: "do I need to do anything?" Reorder is the most prominent action;
 * orders in progress are listed under it in plain language.
 */
export function HomePage() {
  const { t, i18n } = useTranslation();
  const { data: me } = useMe();
  const { data: config } = useAppConfig();
  const [patientId, setPatientId] = useState(rememberedPatient);
  const [familyOpen, setFamilyOpen] = useState(false);

  const home = useQuery({
    queryKey: ['home'],
    queryFn: () => api.get<HomeDto>('/home'),
    refetchInterval: 30_000, // statuses change as the pharmacist and store work
  });

  const selectPatient = (id: string) => {
    setPatientId(id);
    try {
      localStorage.setItem(PATIENT_KEY, id);
    } catch {
      // not essential
    }
  };

  const data = home.data;
  const knownPatient = data?.patients.some((p) => p.id === patientId);
  const activePatientId = patientId !== ALL_PATIENTS && knownPatient ? patientId : ALL_PATIENTS;

  const view = useMemo(() => {
    if (!data) return null;
    const matches = (id: string) => activePatientId === ALL_PATIENTS || id === activePatientId;
    const refills = data.refills.filter((r) => matches(r.patient.id));
    const dueSoon = refills.filter((r) => r.daysLeft <= REFILL_DUE_SOON_DAYS);
    const later = refills.filter((r) => r.daysLeft > REFILL_DUE_SOON_DAYS);
    // One card per patient, so "Reorder" covers everything that person needs soon.
    const groups = new Map<string, RefillDto[]>();
    for (const refill of dueSoon) groups.set(refill.patient.id, [...(groups.get(refill.patient.id) ?? []), refill]);
    return {
      cards: [...groups.values()],
      later,
      activeOrders: data.activeOrders.filter((o) => matches(o.patient.id)),
      pastOrders: data.pastOrders.filter((o) => matches(o.patient.id)),
    };
  }, [data, activePatientId]);

  if (me?.needsOnboarding) return <Navigate to="/welcome" replace />;

  const selectedPatient = data?.patients.find((p) => p.id === activePatientId);
  const isEmpty =
    view && view.cards.length === 0 && view.later.length === 0 && view.activeOrders.length === 0 && view.pastOrders.length === 0;

  return (
    <CustomerLayout>
      {me && (
        <h1 className="font-serif text-title font-semibold text-ink">
          {t(`home.${greetingKey()}`, { name: firstName(me.name) })}
        </h1>
      )}

      {data && data.patients.length > 0 && (
        <button
          type="button"
          onClick={() => setFamilyOpen(true)}
          className="mt-3 flex h-11 items-center gap-1.5 rounded-full border border-line-strong bg-surface pl-4 pr-3 text-body text-ink hover:bg-sunken"
        >
          <span className="text-ink-2">{t('home.orderingFor')}:</span>
          <span className="font-medium">{selectedPatient ? selectedPatient.fullName : t('home.everyone')}</span>
          <ChevronDown className="size-4 text-ink-2" aria-hidden />
        </button>
      )}

      <div className="mt-8" aria-live="polite">
        {home.isLoading && (
          <div className="flex flex-col gap-6">
            <Skeleton className="h-56 w-full rounded-md" />
            <Skeleton className="h-6 w-1/3" />
            <Skeleton className="h-16 w-full" />
            <LoadingNote />
          </div>
        )}

        {home.isError && !data && (
          <ErrorState message={`${t('home.loadError')} ${errorMessage(home.error, t)}`} onRetry={() => void home.refetch()} />
        )}

        {isEmpty && (
          <EmptyState
            illustration={<PrescriptionIllustration />}
            title={t('home.emptyTitle')}
            body={
              <ol className="mt-2 flex flex-col gap-2 text-left">
                {(['emptyStep1', 'emptyStep2', 'emptyStep3'] as const).map((key, index) => (
                  <li key={key} className="flex items-start gap-3">
                    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-pine-subtle text-caption font-semibold text-pine">
                      {index + 1}
                    </span>
                    <span className="pt-0.5">{t(`home.${key}`)}</span>
                  </li>
                ))}
              </ol>
            }
            action={
              <div className="flex flex-col gap-3">
                <ButtonLink to="/order/new" size="xl" fullWidth icon={<Camera className="size-5" aria-hidden />}>
                  {t('home.uploadPrescription')}
                </ButtonLink>
                {config?.testMode && (
                  <Link to="/order/new?sample=1" className="py-2 text-body font-medium text-pine hover:underline">
                    {t('home.trySample')}
                  </Link>
                )}
              </div>
            }
          />
        )}

        {view && !isEmpty && (
          <div className="flex flex-col gap-10">
            {view.cards.length > 0 && (
              <section aria-labelledby="due-soon">
                <h2 id="due-soon" className="mb-3 text-caption font-medium uppercase tracking-wide text-ink-3">
                  {t('home.dueSoon')}
                </h2>
                <div className="flex flex-col gap-4">
                  {view.cards.map((refills) => (
                    <RefillCard key={refills[0]!.patient.id} refills={refills} />
                  ))}
                </div>
              </section>
            )}

            {view.later.length > 0 && (
              <section aria-labelledby="later">
                <h2 id="later" className="mb-1 text-caption font-medium uppercase tracking-wide text-ink-3">
                  {t('home.later')}
                </h2>
                <ul className="divide-y divide-line border-y border-line">
                  {view.later.map((refill) => (
                    <li key={refill.id} className="flex items-baseline justify-between gap-4 py-3">
                      <span>
                        <span className="text-body-lg text-ink">{refill.product.displayName}</span>
                        <span className="block text-caption text-ink-2">
                          {refill.patient.relation === 'SELF' ? t('home.forYou') : t('home.forPatient', { name: refill.patient.fullName })}
                        </span>
                      </span>
                      <span className="shrink-0 text-body text-ink-2">
                        {formatCalendarDate(refill.runOutOn, i18n.language)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {view.activeOrders.length > 0 && (
              <OrderList id="in-progress" title={t('home.inProgress')} orders={view.activeOrders} />
            )}

            <div className="flex flex-col gap-3">
              <ButtonLink to="/order/new" variant="secondary" size="lg" fullWidth icon={<Camera className="size-5" aria-hidden />}>
                {t('home.uploadPrescription')}
              </ButtonLink>
              <ButtonLink to="/order/new?search=1" variant="secondary" size="lg" fullWidth icon={<Search className="size-5" aria-hidden />}>
                {t('home.searchMedicines')}
              </ButtonLink>
            </div>

            {view.pastOrders.length > 0 && (
              <OrderList id="past" title={t('home.pastOrders')} orders={view.pastOrders} />
            )}

            <p className="text-center text-caption text-ink-3">{t('common.pharmacistFooter')}</p>
          </div>
        )}
      </div>

      {data && (
        <FamilySheet
          open={familyOpen}
          onOpenChange={setFamilyOpen}
          patients={data.patients}
          selected={activePatientId}
          onSelect={selectPatient}
        />
      )}
    </CustomerLayout>
  );
}

function OrderList({ id, title, orders }: { id: string; title: string; orders: OrderSummaryDto[] }) {
  const { t } = useTranslation();
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="mb-1 text-caption font-medium uppercase tracking-wide text-ink-3">
        {title}
      </h2>
      <ul className="divide-y divide-line border-y border-line">
        {orders.map((order) => (
          <li key={order.id}>
            <Link to={`/orders/${order.id}`} className="flex items-center gap-3 py-3.5 hover:bg-sunken/60">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-mono text-caption text-ink-2">{order.number}</span>
                  <span className="text-caption text-ink-3">·</span>
                  <span className="text-caption text-ink-2">
                    {order.patient.relation === 'SELF' ? t('home.forYou') : firstName(order.patient.fullName)}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-body-lg text-ink">{order.itemsSummary}</p>
                <div className="mt-1.5">
                  <StatusPill status={order.status} />
                </div>
              </div>
              <ChevronRight className="size-5 shrink-0 text-ink-3" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
