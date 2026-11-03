import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { canCustomerCancel, formatRupees, isTerminal, type OrderDetailDto } from '@nirantar/shared';
import { ArrowLeft, Camera, Check, FileImage } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useParams } from 'react-router';
import { Banner } from '../../design-system/Banner';
import { StatusPill } from '../../design-system/Badge';
import { Button, ButtonLink } from '../../design-system/Button';
import { RadioCard } from '../../design-system/RadioCard';
import { Sheet } from '../../design-system/Sheet';
import { EmptyState, ErrorState, LoadingNote, Skeleton } from '../../design-system/States';
import { CustomerLayout } from '../../layouts/CustomerLayout';
import { api, ApiError } from '../../lib/api';
import { cn } from '../../lib/cn';
import { errorMessage } from '../../lib/errors';
import { formatDateTime } from '../../lib/format';
import { reuploadForOrder } from '../../lib/upload';

const PAYABLE = ['APPROVED', 'AWAITING_STOCK', 'ASSIGNED', 'PICKING', 'PACKED'];

/** C4: where is my order, and do I need to do anything? */
export function OrderStatusPage() {
  const { id } = useParams();
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const order = useQuery({
    queryKey: ['order', id],
    queryFn: () => api.get<OrderDetailDto>(`/orders/${id}`),
    refetchInterval: (query) =>
      query.state.data && isTerminal(query.state.data.status) ? false : 10_000,
  });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['order', id] });
    void queryClient.invalidateQueries({ queryKey: ['home'] });
  };

  const [cancelOpen, setCancelOpen] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);
  const cancel = useMutation({
    mutationFn: () => api.post<void>(`/orders/${id}/cancel`, { version: order.data!.version }),
    onSuccess: () => {
      setCancelOpen(false);
      refresh();
    },
  });

  const data = order.data;
  if (order.isError) {
    const missing = order.error instanceof ApiError && order.error.status === 404;
    return (
      <CustomerLayout>
        {missing ? (
          <EmptyState
            title={t('track.notFound')}
            action={
              <ButtonLink to="/home" variant="secondary" size="lg" fullWidth>
                {t('common.back')}
              </ButtonLink>
            }
          />
        ) : (
          <ErrorState message={errorMessage(order.error, t)} onRetry={() => void order.refetch()} />
        )}
      </CustomerLayout>
    );
  }

  return (
    <CustomerLayout>
      <button
        type="button"
        onClick={() => navigate('/home')}
        className="-ml-2 mb-3 flex h-11 items-center gap-1 px-2 text-body text-ink-2 hover:text-ink"
      >
        <ArrowLeft className="size-5" aria-hidden /> {t('common.back')}
      </button>
      {!data ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-48 w-full" />
          <LoadingNote />
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {(location.state as { placed?: boolean } | null)?.placed &&
            data.status === 'AWAITING_PHARMACIST' && (
              <Banner tone="success" title={t('order.placed')} />
            )}
          <header aria-live="polite">
            <p className="text-caption text-ink-2">
              <span className="font-mono">{data.number}</span> ·{' '}
              {t('track.for', { name: data.patient.fullName })}
            </p>
            <h1 className="mt-2 font-serif text-display font-semibold text-ink">
              {t(`track.sentence.${data.status}`, { store: data.storeName ?? '' })}
            </h1>
            {t(`track.support.${data.status}`, {
              defaultValue: '',
              when: data.promisedBy ? formatDateTime(data.promisedBy, i18n.language) : '',
            }) && (
              <p className="mt-2 text-body-lg text-ink-2">
                {t(`track.support.${data.status}`, {
                  when: data.promisedBy ? formatDateTime(data.promisedBy, i18n.language) : '',
                })}
              </p>
            )}
          </header>

          <ActionPanel order={data} onDone={refresh} />

          <Timeline order={data} />

          <section aria-labelledby="items">
            <h2 id="items" className="mb-1 text-heading font-semibold text-ink">
              {t('track.items')}
            </h2>
            <ul className="divide-y divide-line border-y border-line">
              {data.items
                .filter((i) => i.status === 'ACTIVE')
                .map((item) => (
                  <li key={item.id} className="flex justify-between gap-3 py-3">
                    <span>
                      <span className="block text-body-lg text-ink">
                        {item.product.displayName} × {item.quantity}
                      </span>
                      <span className="text-caption text-ink-2">
                        {item.product.brandName} · {item.product.packLabel}
                      </span>
                    </span>
                    <span className="shrink-0 text-body-lg tabular-nums">
                      {formatRupees(item.unitPricePaise * item.quantity)}
                    </span>
                  </li>
                ))}
              <li className="flex justify-between py-3 text-body-lg font-semibold">
                <span>{t('track.total')}</span>
                <span className="tabular-nums">{formatRupees(data.totalPaise)}</span>
              </li>
            </ul>
            <p className="mt-2 text-caption text-ink-2">
              {t('track.payment')}: {data.paymentMethod === 'COD' ? t('order.cod') : t('order.upi')}
            </p>
          </section>

          <div className="flex flex-col gap-3">
            {data.prescriptionId && data.prescriptionHasImage && (
              <Button
                variant="secondary"
                size="lg"
                fullWidth
                icon={<FileImage className="size-5" aria-hidden />}
                onClick={() => setImageOpen(true)}
              >
                {t('track.viewPrescription')}
              </Button>
            )}
            {canCustomerCancel(data.status) && (
              <Button variant="danger" size="lg" fullWidth onClick={() => setCancelOpen(true)}>
                {t('track.cancelOrder')}
              </Button>
            )}
          </div>

          <Sheet
            open={cancelOpen}
            onOpenChange={setCancelOpen}
            title={t('track.cancelConfirm')}
            description={t('track.cancelBody')}
          >
            {cancel.error && (
              <Banner tone="danger" className="mb-4" title={errorMessage(cancel.error, t)} />
            )}
            <div className="flex flex-col gap-3">
              <Button size="xl" fullWidth onClick={() => setCancelOpen(false)}>
                {t('track.keepOrder')}
              </Button>
              <Button
                variant="danger"
                size="lg"
                fullWidth
                loading={cancel.isPending}
                onClick={() => cancel.mutate()}
              >
                {t('track.cancelOrder')}
              </Button>
            </div>
          </Sheet>
          {data.prescriptionId && data.prescriptionHasImage && (
            <PrescriptionImageSheet
              open={imageOpen}
              onOpenChange={setImageOpen}
              prescriptionId={data.prescriptionId}
            />
          )}
        </div>
      )}
    </CustomerLayout>
  );
}

function ActionPanel({ order, onDone }: { order: OrderDetailDto; onDone: () => void }) {
  const { t } = useTranslation();
  const fileInput = useRef<HTMLInputElement>(null);
  const [upiOpen, setUpiOpen] = useState(false);
  const [choices, setChoices] = useState<Record<string, 'KEEP' | 'SWITCH'>>({});

  const reupload = useMutation({
    mutationFn: (file: File) => reuploadForOrder(file, order.id),
    onSuccess: onDone,
  });
  const decide = useMutation({
    mutationFn: () =>
      api.post(`/orders/${order.id}/decision`, {
        version: order.version,
        choices: Object.entries(choices).map(([itemId, choice]) => ({ itemId, choice })),
      }),
    onSuccess: onDone,
  });
  const pay = useMutation({
    mutationFn: (outcome: 'SUCCESS' | 'FAILURE') =>
      api.post(`/orders/${order.id}/pay-test`, { outcome }),
    onSuccess: () => {
      setUpiOpen(false);
      onDone();
    },
  });
  const cash = useMutation({
    mutationFn: () => api.post(`/orders/${order.id}/pay-cash`),
    onSuccess: onDone,
  });

  const panel = 'rounded-md bg-surface p-5 shadow-raised';

  if (order.status === 'ON_HOLD_REUPLOAD') {
    return (
      <section className={panel}>
        <p className="text-body-lg text-ink">
          {t(`track.reuploadReason.${order.reuploadReason ?? 'OTHER'}`)}
        </p>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={(e) => e.target.files?.[0] && reupload.mutate(e.target.files[0])}
        />
        {reupload.error && (
          <Banner tone="danger" className="mt-3" title={errorMessage(reupload.error, t)} />
        )}
        <Button
          size="xl"
          fullWidth
          className="mt-4"
          icon={<Camera className="size-5" aria-hidden />}
          loading={reupload.isPending}
          onClick={() => fileInput.current?.click()}
        >
          {t('track.takeNewPhoto')}
        </Button>
      </section>
    );
  }

  if (order.status === 'AWAITING_CUSTOMER') {
    const offered = order.items.filter((i) => i.status === 'ACTIVE' && i.offeredGeneric);
    const changes = order.items.filter(
      (i) =>
        i.status === 'REMOVED' ||
        i.quantity !== i.requestedQuantity ||
        i.product.id !== i.requestedProductId,
    );
    const ready = offered.every((i) => choices[i.id]);
    return (
      <section className={panel}>
        <h2 className="text-heading font-semibold text-ink">{t('track.changesTitle')}</h2>
        {changes.length > 0 && (
          <ul className="mt-3 flex flex-col gap-2">
            {changes.map((i) => (
              <li key={i.id} className="text-body text-ink">
                <span className="font-medium">{i.product.displayName}</span>{' '}
                <span className="text-ink-2">
                  {i.status === 'REMOVED'
                    ? t('track.removed', { reason: i.removedReason ?? '' })
                    : t('track.qtyChanged', { from: i.requestedQuantity, to: i.quantity })}
                </span>
              </li>
            ))}
          </ul>
        )}
        {offered.map((item) => (
          <fieldset key={item.id} className="mt-5">
            <legend className="mb-1 text-body font-semibold text-ink">
              {t('track.genericTitle')}
            </legend>
            <p className="mb-3 text-caption text-ink-2">{t('track.genericNote')}</p>
            <div className="flex flex-col gap-2">
              <RadioCard
                name={`g-${item.id}`}
                value="KEEP"
                checked={choices[item.id] === 'KEEP'}
                onChange={() => setChoices({ ...choices, [item.id]: 'KEEP' })}
                title={t('track.keep', { name: item.product.brandName })}
                description={t('track.perPack', { price: formatRupees(item.product.pricePaise) })}
              />
              <RadioCard
                name={`g-${item.id}`}
                value="SWITCH"
                checked={choices[item.id] === 'SWITCH'}
                onChange={() => setChoices({ ...choices, [item.id]: 'SWITCH' })}
                title={t('track.switch', { name: item.offeredGeneric!.brandName })}
                description={t('track.perPack', {
                  price: formatRupees(item.offeredGeneric!.pricePaise),
                })}
              />
            </div>
          </fieldset>
        ))}
        {decide.error && (
          <Banner tone="danger" className="mt-4" title={errorMessage(decide.error, t)} />
        )}
        <Button
          size="xl"
          fullWidth
          className="mt-5"
          disabled={!ready}
          loading={decide.isPending}
          onClick={() => decide.mutate()}
        >
          {t('track.confirm')}
        </Button>
      </section>
    );
  }

  if (
    order.paymentMethod === 'UPI_TEST' &&
    ['DUE', 'FAILED'].includes(order.paymentStatus) &&
    PAYABLE.includes(order.status)
  ) {
    return (
      <section className={panel}>
        <h2 className="text-heading font-semibold text-ink">
          {t('track.payTitle', { amount: formatRupees(order.totalPaise) })}
        </h2>
        {order.paymentStatus === 'FAILED' && (
          <p className="mt-1 text-body text-warning">{t('track.payFailed')}</p>
        )}
        <Button size="xl" fullWidth className="mt-4" onClick={() => setUpiOpen(true)}>
          {t('track.payUpi')}
        </Button>
        <Button
          variant="quiet"
          size="lg"
          fullWidth
          className="mt-2"
          loading={cash.isPending}
          onClick={() => cash.mutate()}
        >
          {t('track.payCash')}
        </Button>
        <Sheet
          open={upiOpen}
          onOpenChange={setUpiOpen}
          title={t('track.upiSheet')}
          description={t('track.upiSheetBody')}
        >
          <p className="mb-5 text-display font-semibold tabular-nums text-ink">
            {formatRupees(order.totalPaise)}
          </p>
          {pay.error && (
            <Banner tone="danger" className="mb-4" title={errorMessage(pay.error, t)} />
          )}
          <div className="flex flex-col gap-3">
            <Button
              size="xl"
              fullWidth
              loading={pay.isPending && pay.variables === 'SUCCESS'}
              onClick={() => pay.mutate('SUCCESS')}
            >
              {t('track.succeed')}
            </Button>
            <Button
              variant="secondary"
              size="lg"
              fullWidth
              loading={pay.isPending && pay.variables === 'FAILURE'}
              onClick={() => pay.mutate('FAILURE')}
            >
              {t('track.fail')}
            </Button>
          </div>
        </Sheet>
      </section>
    );
  }

  if (order.status === 'AWAITING_STOCK') {
    return (
      <Banner tone="warning" title={t('track.stockTitle')}>
        {t('track.stockBody')}
      </Banner>
    );
  }

  if (order.status === 'REJECTED') {
    return (
      <section className={panel}>
        <p className="text-body-lg text-ink">
          {t(`track.rejectedReason.${order.rejectionReason ?? 'OTHER'}`)}
        </p>
        {order.rejectionNote && (
          <p className="mt-2 text-body text-ink-2">“{order.rejectionNote}”</p>
        )}
        <ButtonLink
          to={`/order/new?patient=${order.patient.id}`}
          size="xl"
          fullWidth
          className="mt-4"
        >
          {t('track.uploadNew')}
        </ButtonLink>
      </section>
    );
  }
  return null;
}

function Timeline({ order }: { order: OrderDetailDto }) {
  const { t, i18n } = useTranslation();
  const at = (statuses: string[]) => order.events.find((e) => statuses.includes(e.toStatus))?.at;
  const steps = [
    { key: 'placed', at: order.placedAt },
    {
      key: 'checked',
      at: at(['APPROVED', 'AWAITING_CUSTOMER']),
      detail: order.verifiedBy
        ? t('track.checkedBy', { name: order.verifiedBy.name, reg: order.verifiedBy.regNo })
        : null,
    },
    {
      key: 'packed',
      at: at(['PACKED']),
      detail: order.storeName && order.invoiceNo ? `${order.storeName} · ${order.invoiceNo}` : null,
    },
    { key: 'onTheWay', at: at(['OUT_FOR_DELIVERY']) },
    { key: 'delivered', at: at(['DELIVERED']) },
  ];
  if (order.status === 'REJECTED' || order.status === 'CANCELLED') return null;
  return (
    <section aria-labelledby="timeline">
      <h2 id="timeline" className="mb-3 text-heading font-semibold text-ink">
        {t('track.timeline')}
      </h2>
      <ol className="flex flex-col">
        {steps.map((step, index) => {
          const done = Boolean(step.at);
          return (
            <li key={step.key} className="flex gap-4">
              <div className="flex flex-col items-center">
                <span
                  className={cn(
                    'grid size-7 place-items-center rounded-full border-2 transition-colors duration-180',
                    done ? 'border-pine bg-pine text-white' : 'border-line-strong bg-surface',
                  )}
                >
                  {done && <Check className="size-4" strokeWidth={3} aria-hidden />}
                </span>
                {index < steps.length - 1 && (
                  <span className={cn('w-0.5 flex-1', done ? 'bg-pine' : 'bg-line')} />
                )}
              </div>
              <div className="pb-5">
                <p className={cn('text-body-lg', done ? 'font-medium text-ink' : 'text-ink-3')}>
                  {t(`track.steps.${step.key}`)}
                </p>
                {step.at && (
                  <p className="text-caption text-ink-2">
                    {formatDateTime(step.at, i18n.language)}
                  </p>
                )}
                {done && step.detail && <p className="text-caption text-ink-2">{step.detail}</p>}
              </div>
            </li>
          );
        })}
      </ol>
      <p className="sr-only">
        <StatusPill status={order.status} />
      </p>
    </section>
  );
}

/** The decrypted image is fetched with the session cookie (never a public link) and freed when closed. */
export function PrescriptionImageSheet({
  open,
  onOpenChange,
  prescriptionId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  prescriptionId: string;
}) {
  const { t } = useTranslation();
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!open) return;
    let objectUrl: string | undefined;
    void fetch(`/api/prescriptions/${prescriptionId}/image`, { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.blob() : Promise.reject()))
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => setUrl(undefined));
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setUrl(undefined);
    };
  }, [open, prescriptionId]);
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={t('track.viewPrescription')}>
      {url ? (
        <img
          src={url}
          alt={t('track.viewPrescription')}
          className="w-full rounded-sm border border-line"
        />
      ) : (
        <Skeleton className="h-96 w-full" />
      )}
    </Sheet>
  );
}
