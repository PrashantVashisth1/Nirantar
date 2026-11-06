import type { TFunction } from 'i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  LOCALITIES,
  formatRupees,
  type AddressDto,
  type HomeDto,
  type PrescriptionDto,
  type ProductSummaryDto,
  type QuoteDto,
} from '@nirantar/shared';
import { ArrowLeft, Minus, Plus, Search, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router';
import { Banner } from '../../design-system/Banner';
import { Button } from '../../design-system/Button';
import { Checkbox, SelectField, TextField } from '../../design-system/Field';
import { RadioCard } from '../../design-system/RadioCard';
import { Sheet } from '../../design-system/Sheet';
import { ErrorState, Skeleton } from '../../design-system/States';
import { intlLocale } from '../../i18n';
import { CustomerLayout } from '../../layouts/CustomerLayout';
import { api } from '../../lib/api';
import { errorMessage } from '../../lib/errors';
import { formatCalendarDate } from '../../lib/format';
import { useMe } from '../../lib/session';
import { PrescriptionBlock, type OnFile } from './PrescriptionBlock';

interface CartLine {
  product: ProductSummaryDto;
  quantity: number;
  fromPrescription: boolean;
}

interface ReorderDraft {
  patientId: string;
  prescriptionId: string | null;
  prescriptionOnFile: { prescriberName: string | null; prescribedOn: string } | null;
  items: { product: ProductSummaryDto; quantity: number }[];
}

/**
 * C3: Cart & checkout in two stages on one screen. Used by one-tap reorder
 * (pre-filled from refills) and by a new prescription photo (AI draft).
 */
export function NewOrderPage() {
  const { t, i18n } = useTranslation();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: me } = useMe();

  const refillIds = params.get('refill');
  const [stage, setStage] = useState<1 | 2>(1);
  const [patientId, setPatientId] = useState<string | null>(params.get('patient'));
  const [onFile, setOnFile] = useState<(OnFile & { prescriptionId: string }) | null>(null);
  const [prescription, setPrescription] = useState<PrescriptionDto | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [unmatched, setUnmatched] = useState(0);
  const [searchOpen, setSearchOpen] = useState(params.get('search') === '1');
  const [addressId, setAddressId] = useState<string | null>(null);
  const [addressOpen, setAddressOpen] = useState(false);
  const [payment, setPayment] = useState<'COD' | 'UPI_TEST'>('COD');
  const [reminders, setReminders] = useState(me?.remindersOptIn ?? true);
  const [note, setNote] = useState('');

  const home = useQuery({ queryKey: ['home'], queryFn: () => api.get<HomeDto>('/home') });
  const addresses = useQuery({
    queryKey: ['addresses'],
    queryFn: () => api.get<AddressDto[]>('/addresses'),
  });
  const reorder = useQuery({
    queryKey: ['reorder', refillIds],
    queryFn: () => api.get<ReorderDraft>(`/refills/reorder?ids=${refillIds}`),
    enabled: Boolean(refillIds),
  });

  // Defaults once data arrives.
  useEffect(() => {
    if (!patientId && home.data?.patients.length) {
      setPatientId(
        (home.data.patients.find((p) => p.relation === 'SELF') ?? home.data.patients[0]!).id,
      );
    }
  }, [home.data, patientId]);
  useEffect(() => {
    if (!addressId && addresses.data?.length)
      setAddressId((addresses.data.find((a) => a.isDefault) ?? addresses.data[0]!).id);
  }, [addresses.data, addressId]);
  useEffect(() => {
    const draft = reorder.data;
    if (!draft) return;
    setPatientId(draft.patientId);
    setCart(
      draft.items.map((i) => ({
        product: i.product,
        quantity: i.quantity,
        fromPrescription: true,
      })),
    );
    if (draft.prescriptionId && draft.prescriptionOnFile) {
      setOnFile({
        id: draft.prescriptionId,
        prescriptionId: draft.prescriptionId,
        label: t('order.onFile', {
          prescriber: draft.prescriptionOnFile.prescriberName ?? '',
          date: formatCalendarDate(draft.prescriptionOnFile.prescribedOn, i18n.language),
        }),
      });
    }
  }, [reorder.data, t, i18n.language]);

  const onRead = useCallback((p: PrescriptionDto) => {
    setPrescription(p);
    const lines = p.draft?.lines ?? [];
    setUnmatched(lines.filter((l) => !l.product).length + (p.draft?.unreadableLineCount ?? 0));
    setCart((current) => {
      const next = current.filter((l) => !l.fromPrescription);
      for (const line of lines) {
        if (line.product && !next.some((n) => n.product.id === line.product!.id)) {
          next.push({
            product: line.product,
            quantity: line.suggestedQuantity,
            fromPrescription: true,
          });
        }
      }
      return next;
    });
  }, []);

  const prescriptionId = prescription?.id ?? onFile?.prescriptionId ?? null;
  const items = useMemo(
    () => cart.map((l) => ({ productId: l.product.id, quantity: l.quantity })),
    [cart],
  );

  const quote = useQuery({
    queryKey: ['quote', patientId, addressId, prescriptionId, items],
    queryFn: () =>
      api.post<QuoteDto>('/checkout/quote', {
        patientId,
        addressId: addressId ?? undefined,
        prescriptionId: prescriptionId ?? undefined,
        items,
      }),
    enabled: Boolean(patientId) && items.length > 0,
    placeholderData: (previous) => previous,
  });

  const needsRx = quote.data?.needsPrescription ?? cart.some((l) => l.product.schedule !== 'OTC');
  // With an empty cart a prescription photo is enough: the pharmacist adds the medicines.
  const canContinue = cart.length > 0 ? !needsRx || Boolean(prescriptionId) : Boolean(prescriptionId);

  const place = useMutation({
    mutationFn: () =>
      api.post<{ id: string; number: string }>('/orders', {
        patientId,
        addressId,
        prescriptionId: prescriptionId ?? undefined,
        items,
        paymentMethod: payment,
        remindersOptIn: reminders,
        note: note.trim() || undefined,
        source: refillIds ? 'REFILL' : 'NEW',
      }),
    onSuccess: (order) => {
      void queryClient.invalidateQueries({ queryKey: ['home'] });
      navigate(`/orders/${order.id}`, { replace: true, state: { placed: true } });
    },
  });

  const loading = home.isLoading || (refillIds && reorder.isLoading);
  const patients = home.data?.patients ?? [];

  return (
    <CustomerLayout>
      <button
        type="button"
        onClick={() => (stage === 2 ? setStage(1) : navigate('/home'))}
        className="-ml-2 mb-3 flex h-11 items-center gap-1 px-2 text-body text-ink-2 hover:text-ink"
      >
        <ArrowLeft className="size-5" aria-hidden /> {t('order.back')}
      </button>
      <h1 className="font-serif text-title font-semibold text-ink">{t('order.title')}</h1>
      <p className="mt-1 text-caption font-medium uppercase tracking-wide text-ink-3">
        {stage === 1 ? t('order.stage1') : t('order.stage2')}
      </p>

      {loading && <Skeleton className="mt-8 h-64 w-full" />}
      {reorder.isError && (
        <div className="mt-6">
          <ErrorState message={errorMessage(reorder.error, t)} />
        </div>
      )}

      {!loading && stage === 1 && (
        <div className="mt-8 flex flex-col gap-8">
          <section aria-labelledby="for">
            <h2 id="for" className="mb-3 text-heading font-semibold text-ink">
              {t('order.for')}
            </h2>
            <div className="flex flex-col gap-2" role="radiogroup" aria-labelledby="for">
              {patients.map((p) => (
                <RadioCard
                  key={p.id}
                  name="patient"
                  value={p.id}
                  checked={patientId === p.id}
                  onChange={(id) => {
                    if (id === patientId) return;
                    setPatientId(id);
                    // A prescription belongs to one person: switching person starts over.
                    setPrescription(null);
                    setOnFile(null);
                    setCart((c) => c.filter((l) => !l.fromPrescription));
                  }}
                  title={p.fullName}
                  description={t(`relation.${p.relation}`)}
                />
              ))}
            </div>
          </section>

          <section aria-labelledby="rx">
            <h2 id="rx" className="mb-3 text-heading font-semibold text-ink">
              {t('order.prescription')}
            </h2>
            <PrescriptionBlock
              patientId={patientId}
              onFile={onFile}
              prescription={prescription}
              onUploaded={setPrescription}
              onRead={onRead}
              onClear={() => {
                setPrescription(null);
                setCart((c) => c.filter((l) => !l.fromPrescription));
              }}
              autoSample={params.get('sample') === '1'}
            />
          </section>

          <section aria-labelledby="meds">
            <h2 id="meds" className="mb-1 text-heading font-semibold text-ink">
              {t('order.medicines')}
            </h2>
            {prescription?.draft && cart.some((l) => l.fromPrescription) && (
              <p className="mb-2 text-body text-ink-2">
                {t('order.found', { count: cart.filter((l) => l.fromPrescription).length })}
              </p>
            )}
            {cart.length === 0 ? (
              // An unreadable photo already says what happens next, in its own banner.
              prescription?.aiStatus !== 'UNREADABLE' && (
                <p className="py-3 text-body text-ink-2">{prescriptionId ? t('order.pharmacistWillAdd') : t('order.emptyCart')}</p>
              )
            ) : (
              <ul className="divide-y divide-line border-y border-line">
                {cart.map((line) => (
                  <CartRow
                    key={line.product.id}
                    line={line}
                    onQuantity={(quantity) =>
                      setCart((c) =>
                        c.map((l) => (l.product.id === line.product.id ? { ...l, quantity } : l)),
                      )
                    }
                    onRemove={() =>
                      setCart((c) => c.filter((l) => l.product.id !== line.product.id))
                    }
                  />
                ))}
              </ul>
            )}
            {unmatched > 0 && prescription?.aiStatus !== 'UNREADABLE' && (
              <p className="mt-3 text-body text-ink-2">
                {t('order.unmatched', { count: unmatched })}
              </p>
            )}
            <Button
              variant="secondary"
              size="lg"
              fullWidth
              className="mt-4"
              icon={<Search className="size-5" aria-hidden />}
              onClick={() => setSearchOpen(true)}
            >
              {t('order.addMedicine')}
            </Button>
          </section>

          <div className="sticky bottom-0 -mx-4 border-t border-line bg-canvas px-4 py-3 sm:-mx-6 sm:px-6">
            {cart.length > 0 && needsRx && !prescriptionId && (
              <p className="mb-2 text-caption text-warning">{t('order.needsRxToContinue')}</p>
            )}
            <Button size="xl" fullWidth disabled={!canContinue} onClick={() => setStage(2)}>
              {t('order.continue')}
            </Button>
          </div>
        </div>
      )}

      {!loading && stage === 2 && (
        <div className="mt-8 flex flex-col gap-8">
          <section aria-labelledby="address">
            <h2 id="address" className="mb-3 text-heading font-semibold text-ink">
              {t('order.deliverTo')}
            </h2>
            <div className="flex flex-col gap-2">
              {addresses.data?.map((a) => (
                <RadioCard
                  key={a.id}
                  name="address"
                  value={a.id}
                  checked={addressId === a.id}
                  onChange={setAddressId}
                  title={a.label}
                  description={`${a.line1}, ${a.localityName} ${a.pincode}`}
                />
              ))}
            </div>
            <Button
              variant="quiet"
              size="lg"
              className="mt-2 -ml-3"
              icon={<Plus className="size-5" aria-hidden />}
              onClick={() => setAddressOpen(true)}
            >
              {t('order.addAddress')}
            </Button>
          </section>

          <section aria-labelledby="delivery">
            <h2 id="delivery" className="mb-2 text-heading font-semibold text-ink">
              {t('order.delivery')}
            </h2>
            {quote.data?.delivery ? (
              <p className="text-body-lg text-ink">
                {t('order.likely', {
                  when: deliveryWhen(quote.data.delivery.promisedBy, i18n.language, t),
                  store: quote.data.delivery.storeName,
                  km: quote.data.delivery.distanceKm,
                })}
              </p>
            ) : (
              <p className="text-body-lg text-ink">{t('order.noStoreYet')}</p>
            )}
            <p className="mt-1 text-caption text-ink-3">{t('order.confirmedAfter')}</p>
          </section>

          <section aria-labelledby="payment">
            <h2 id="payment" className="mb-3 text-heading font-semibold text-ink">
              {t('order.payment')}
            </h2>
            <div className="flex flex-col gap-2">
              <RadioCard
                name="payment"
                value="COD"
                checked={payment === 'COD'}
                onChange={() => setPayment('COD')}
                title={t('order.cod')}
              />
              <RadioCard
                name="payment"
                value="UPI_TEST"
                checked={payment === 'UPI_TEST'}
                onChange={() => setPayment('UPI_TEST')}
                title={t('order.upi')}
                description={t('order.upiNote')}
              />
            </div>
          </section>

          <section className="flex flex-col gap-4">
            <Checkbox
              label={t('order.reminders')}
              checked={reminders}
              onChange={(e) => setReminders(e.target.checked)}
            />
            <TextField
              label={t('order.note')}
              value={note}
              maxLength={500}
              onChange={(e) => setNote(e.target.value)}
            />
          </section>

          {place.error && <Banner tone="danger" title={errorMessage(place.error, t)} />}

          <div className="sticky bottom-0 -mx-4 flex items-center gap-4 border-t border-line bg-canvas px-4 py-3 sm:-mx-6 sm:px-6">
            <div className="min-w-0">
              <p className="text-caption text-ink-2">{t('order.total')}</p>
              <p className="text-heading font-semibold tabular-nums text-ink">
                {cart.length === 0 ? t('order.priceLater') : quote.data ? formatRupees(quote.data.totalPaise) : '…'}
              </p>
            </div>
            <Button
              size="xl"
              className="ml-auto flex-1"
              disabled={!addressId}
              loading={place.isPending}
              onClick={() => place.mutate()}
            >
              {place.isPending ? t('order.placing') : t('order.place')}
            </Button>
          </div>
          <p className="-mt-4 text-center text-caption text-ink-3">{t('order.totalNote')}</p>
        </div>
      )}

      <SearchSheet
        open={searchOpen}
        onOpenChange={setSearchOpen}
        onAdd={(product) => {
          setCart((c) =>
            c.some((l) => l.product.id === product.id)
              ? c
              : [...c, { product, quantity: 1, fromPrescription: false }],
          );
          setSearchOpen(false);
        }}
      />
      <AddressSheet
        open={addressOpen}
        onOpenChange={setAddressOpen}
        onSaved={(a) => setAddressId(a.id)}
      />
    </CustomerLayout>
  );
}

function deliveryWhen(iso: string, locale: string, t: TFunction) {
  const date = new Date(iso);
  const time = new Intl.DateTimeFormat(intlLocale(locale), {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  }).format(date);
  const sameDay =
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(date) ===
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  return sameDay ? t('order.today', { time }) : t('order.tomorrow', { time });
}

function CartRow({
  line,
  onQuantity,
  onRemove,
}: {
  line: CartLine;
  onQuantity: (q: number) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  return (
    <li className="py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-body-lg font-medium text-ink">{line.product.displayName}</p>
          <p className="text-body text-ink-2">
            {line.product.brandName} · {line.product.packLabel}
          </p>
          {line.fromPrescription && (
            <p className="mt-0.5 text-caption text-pine">{t('order.fromPrescription')}</p>
          )}
        </div>
        <p className="shrink-0 text-body-lg tabular-nums text-ink">
          {formatRupees(line.product.pricePaise * line.quantity)}
        </p>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-1" role="group" aria-label={t('order.quantity')}>
          <button
            type="button"
            aria-label="−"
            disabled={line.quantity <= 1}
            onClick={() => onQuantity(line.quantity - 1)}
            className="grid size-11 place-items-center rounded-full border border-line-strong bg-surface disabled:text-ink-disabled"
          >
            <Minus className="size-4" aria-hidden />
          </button>
          <span className="w-10 text-center text-body-lg tabular-nums" aria-live="polite">
            {line.quantity}
          </span>
          <button
            type="button"
            aria-label="+"
            disabled={line.quantity >= 30}
            onClick={() => onQuantity(line.quantity + 1)}
            className="grid size-11 place-items-center rounded-full border border-line-strong bg-surface disabled:text-ink-disabled"
          >
            <Plus className="size-4" aria-hidden />
          </button>
        </div>
        <Button
          variant="quiet"
          size="lg"
          icon={<Trash2 className="size-5" aria-hidden />}
          onClick={onRemove}
        >
          {t('order.remove')}
        </Button>
      </div>
    </li>
  );
}

function SearchSheet({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onAdd: (p: ProductSummaryDto) => void;
}) {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const results = useQuery({
    queryKey: ['products', q],
    queryFn: () =>
      api.get<(ProductSummaryDto & { needsPrescription: boolean })[]>(
        `/products?q=${encodeURIComponent(q)}`,
      ),
    enabled: q.trim().length >= 2,
  });
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={t('order.searchTitle')}>
      <TextField
        label={t('order.searchLabel')}
        hint={t('order.searchHint')}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoFocus
        type="search"
      />
      <ul className="mt-4 divide-y divide-line">
        {results.data?.length === 0 && (
          <li className="py-4 text-body text-ink-2">{t('order.noResults')}</li>
        )}
        {results.data?.map((p) => (
          <li key={p.id} className="flex items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p className={p.blocked ? 'text-body-lg text-ink-disabled' : 'text-body-lg text-ink'}>
                {p.displayName}
              </p>
              <p className="text-caption text-ink-2">
                {p.brandName} · {p.packLabel} · {formatRupees(p.pricePaise)}
                {p.needsPrescription && !p.blocked && (
                  <span className="text-ink-3"> · {t('order.needsRx')}</span>
                )}
              </p>
            </div>
            {p.blocked ? (
              <span className="shrink-0 text-caption font-medium text-danger">
                {t('order.notOnline')}
              </span>
            ) : (
              <Button variant="secondary" size="lg" onClick={() => onAdd(p)}>
                {t('order.add')}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

function AddressSheet({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: (a: AddressDto) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    label: 'Home',
    line1: '',
    localityId: LOCALITIES[0]!.id,
    pincode: '',
  });
  const save = useMutation({
    mutationFn: () => api.post<AddressDto>('/addresses', form),
    onSuccess: (address) => {
      void queryClient.invalidateQueries({ queryKey: ['addresses'] });
      onSaved(address);
      onOpenChange(false);
    },
  });
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={t('order.addAddress')}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <TextField
          label={t('order.addressLabel')}
          value={form.label}
          onChange={(e) => setForm({ ...form, label: e.target.value })}
        />
        <TextField
          label={t('order.addressLine')}
          value={form.line1}
          onChange={(e) => setForm({ ...form, line1: e.target.value })}
          autoComplete="street-address"
        />
        <SelectField
          label={t('order.locality')}
          value={form.localityId}
          onChange={(e) => setForm({ ...form, localityId: e.target.value })}
          options={LOCALITIES.map((l) => ({ value: l.id, label: `${l.name}, ${l.city}` }))}
        />
        <TextField
          label={t('order.pincode')}
          inputMode="numeric"
          maxLength={6}
          value={form.pincode}
          onChange={(e) => setForm({ ...form, pincode: e.target.value.replace(/\D/g, '') })}
          autoComplete="postal-code"
        />
        {save.error && <Banner tone="danger" title={errorMessage(save.error, t)} />}
        <Button type="submit" size="xl" fullWidth loading={save.isPending}>
          {t('order.saveAddress')}
        </Button>
      </form>
    </Sheet>
  );
}
