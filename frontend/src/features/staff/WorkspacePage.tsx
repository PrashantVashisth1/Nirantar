import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  REJECTION_REASONS,
  REUPLOAD_REASONS,
  formatRupees,
  type DraftLineDto,
  type ProductSummaryDto,
  type WorkspaceDto,
} from '@nirantar/shared';
import { ArrowLeft, Minus, Plus, RotateCw, Search, ZoomIn, ZoomOut } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Banner } from '../../design-system/Banner';
import { Pill, ScheduleTag } from '../../design-system/Badge';
import { Button } from '../../design-system/Button';
import { Sheet } from '../../design-system/Sheet';
import { ErrorState, Skeleton } from '../../design-system/States';
import i18n from '../../i18n';
import { StaffLayout } from '../../layouts/StaffLayout';
import { api } from '../../lib/api';
import { cn } from '../../lib/cn';
import { errorMessage } from '../../lib/errors';

const t = i18n.t.bind(i18n);
const DOSES = [0, 0.5, 1, 1.5, 2];

interface EditItem {
  key: string;
  itemId?: string;
  originalProductId?: string;
  requestedQuantity?: number;
  product: ProductSummaryDto & { packUnits?: number };
  quantity: number;
  decision: 'APPROVE' | 'REMOVE';
  removedReason: string;
  dose: { morning: number; noon: number; night: number } | null;
  /** Where a pre-filled dose came from, shown next to the dose. Cleared when edited. */
  doseNote: string | null;
  aiUnsure?: boolean;
  asNeeded: boolean;
  durationDays: number | null;
  genericOptions: ProductSummaryDto[];
  offerGenericId: string | null;
}

const field = 'h-9 w-full rounded-sm border border-line-strong bg-surface px-3 text-staff-body focus:border-pine focus:outline-none focus:ring-3 focus:ring-pine-subtle';
const label = 'mb-1 flex items-center gap-2 text-staff-table font-medium text-ink';

/** P2: compare the prescription with the drafted items side by side and decide. */
export function WorkspacePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const ws = useQuery({ queryKey: ['workspace', id], queryFn: () => api.get<WorkspaceDto>(`/pharmacist/orders/${id}`) });

  if (ws.isLoading) {
    return (
      <StaffLayout>
        <div className="grid gap-6 lg:grid-cols-[45fr_55fr]">
          <Skeleton className="h-[70vh] w-full" />
          <Skeleton className="h-[70vh] w-full" />
        </div>
      </StaffLayout>
    );
  }
  if (ws.isError || !ws.data) {
    return (
      <StaffLayout>
        <ErrorState message={errorMessage(ws.error, t)} onRetry={() => void ws.refetch()} />
      </StaffLayout>
    );
  }
  return (
    <Workspace
      key={ws.data.order.version}
      data={ws.data}
      onDone={(message) => {
        void queryClient.invalidateQueries({ queryKey: ['queue'] });
        navigate('/pharmacist', { state: { message } });
      }}
      onReload={() => void ws.refetch()}
    />
  );
}

function Workspace({ data, onDone, onReload }: { data: WorkspaceDto; onDone: (message: string) => void; onReload: () => void }) {
  const draft = data.prescription?.draft ?? null;
  const editable = data.order.status === 'AWAITING_PHARMACIST';

  const [details, setDetails] = useState({
    prescriberName: data.prescription?.prescriberName ?? draft?.prescriberName.value ?? '',
    prescriberRegNo: data.prescription?.prescriberRegNo ?? draft?.prescriberRegNo.value ?? '',
    prescribedOn: data.prescription?.prescribedOn ?? draft?.prescribedOn.value ?? '',
    patientNameOnRx: draft?.patientName.value ?? '',
  });
  const [items, setItems] = useState<EditItem[]>(() =>
    data.items.map((item) => {
      const aiLine = draft?.lines.find((l) => l.product?.id === item.product.id);
      return {
        key: item.id,
        itemId: item.id,
        originalProductId: item.product.id,
        requestedQuantity: item.requestedQuantity,
        product: item.product,
        quantity: item.quantity,
        decision: item.status === 'REMOVED' ? 'REMOVE' : 'APPROVE',
        removedReason: '',
        dose: item.dose ?? aiLine?.dose ?? item.lastFill?.dose ?? null,
        doseNote: item.dose ? null : aiLine?.dose ? 'suggested from the text' : item.lastFill ? 'from the last fill' : null,
        aiUnsure: Boolean(aiLine?.uncertain),
        asNeeded: item.asNeeded,
        durationDays: item.durationDays ?? aiLine?.durationDays ?? item.lastFill?.durationDays ?? null,
        genericOptions: item.genericOptions,
        offerGenericId: item.offeredGenericId,
      };
    }),
  );
  const [confirmed, setConfirmed] = useState(false);
  const [sheet, setSheet] = useState<'reject' | 'reupload' | 'add' | null>(null);
  const [error, setError] = useState<string>();

  const hasH1 = items.some((i) => i.decision === 'APPROVE' && i.product.schedule === 'H1');
  const changed = items.some(
    (i) => !i.itemId || i.decision === 'REMOVE' || i.offerGenericId || i.product.id !== i.originalProductId || i.quantity !== i.requestedQuantity,
  );
  const missing: string[] = [];
  if (!details.prescriberName.trim()) missing.push("prescriber's name");
  if (!details.prescribedOn) missing.push('prescription date');
  if (hasH1 && !details.prescriberRegNo.trim()) missing.push('registration no. (H1)');
  if (items.some((i) => i.decision === 'REMOVE' && !i.removedReason.trim())) missing.push('a reason for each removed medicine');
  if (!items.some((i) => i.decision === 'APPROVE')) missing.push('at least one approved medicine');
  // Without a dose the refill date can't be worked out, so a prescription medicine needs one.
  const noDose = (i: EditItem) => i.product.schedule !== 'OTC' && !i.asNeeded && (i.dose?.morning ?? 0) + (i.dose?.noon ?? 0) + (i.dose?.night ?? 0) === 0;
  if (items.some((i) => i.decision === 'APPROVE' && noDose(i))) missing.push('a dose for each prescription medicine');
  if (!confirmed) missing.push('the confirmation tick');

  const approve = useMutation({
    mutationFn: () =>
      api.post<{ outcome: string; storeName?: string }>(`/pharmacist/orders/${data.order.id}/approve`, {
        version: data.order.version,
        prescription: data.prescription
          ? {
              prescriberName: details.prescriberName.trim(),
              prescriberRegNo: details.prescriberRegNo.trim() || undefined,
              prescribedOn: details.prescribedOn,
              patientNameOnRx: details.patientNameOnRx.trim() || undefined,
            }
          : undefined,
        items: items.map((i) => ({
          itemId: i.itemId,
          productId: i.product.id,
          quantity: i.quantity,
          decision: i.decision,
          removedReason: i.decision === 'REMOVE' ? i.removedReason.trim() : undefined,
          dose: i.asNeeded ? null : i.dose,
          asNeeded: i.asNeeded,
          durationDays: i.durationDays,
          offerGenericProductId: i.decision === 'APPROVE' ? i.offerGenericId : null,
        })),
        confirmedValid: true,
      }),
    onSuccess: (r) =>
      onDone(
        r.outcome === 'ASSIGNED'
          ? `${data.order.number} approved · routed to ${r.storeName} store`
          : r.outcome === 'AWAITING_CUSTOMER'
            ? `${data.order.number} approved · sent to the customer to confirm`
            : `${data.order.number} approved · waiting for stock`,
      ),
    onError: (e) => setError(errorMessage(e, t)),
  });

  // Keyboard: A approve, R reject, U re-upload (not while typing in a field).
  useEffect(() => {
    if (!editable) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (sheet || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'a' && missing.length === 0) approve.mutate();
      if (e.key === 'r') setSheet('reject');
      if (e.key === 'u') setSheet('reupload');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const update = (key: string, patch: Partial<EditItem>) => setItems((list) => list.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  const nameMismatch =
    draft?.patientName.value && !draft.patientName.value.toLowerCase().includes(data.patient.fullName.split(' ')[0]!.toLowerCase());
  const unmatchedLines = draft?.lines.filter((l) => !l.product || !items.some((i) => i.product.id === l.product!.id)) ?? [];
  const minutes = Math.max(0, Math.round((Date.now() - new Date(data.order.placedAt).getTime()) / 60_000));

  return (
    <StaffLayout>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Link to="/pharmacist" className="flex items-center gap-1 text-staff-body text-ink-2 hover:text-ink">
          <ArrowLeft className="size-4" aria-hidden /> Queue
        </Link>
        <h1 className="text-staff-title font-semibold text-ink">
          <span className="font-mono">{data.order.number}</span>
        </h1>
        <span className="text-staff-body text-ink-2">
          {data.patient.fullName}
          {data.patient.ageYears && `, ${data.patient.ageYears}`} · ordered by {data.customer.name || 'customer'} ({data.customer.phoneMasked}) · {data.order.source === 'REFILL' ? 'Refill' : 'New prescription'}
        </span>
        <span className={cn('ml-auto text-staff-body tabular-nums', minutes > 10 ? 'font-semibold text-danger' : minutes >= 5 ? 'font-semibold text-warning' : 'text-ink-2')}>
          Waiting {minutes} min
        </span>
      </div>

      {data.reviewingBy && <Banner tone="warning" className="mt-4" title={`${data.reviewingBy} is reviewing this order right now.`} />}
      {!editable && <Banner tone="info" className="mt-4" title={`This order is no longer waiting for verification (${data.order.status.replaceAll('_', ' ').toLowerCase()}).`} />}

      <div className="mt-5 grid gap-6 lg:grid-cols-[45fr_55fr]">
        <PrescriptionViewer prescriptionId={data.prescription?.hasImage ? data.prescription.id : null} />

        <div className="flex min-w-0 flex-col gap-6 pb-28">
          <div className="flex flex-col gap-2">
            {data.prescription?.aiStatus === 'FAILED' && <Banner tone="neutral" title="The AI couldn't read this prescription. Add the medicines from the image." />}
            {data.prescription?.aiStatus === 'UNREADABLE' && <Banner tone="warning" title="The AI found this hard to read. Consider requesting a clearer photo." />}
            {nameMismatch && <Banner tone="warning" title={`Name on the prescription ("${draft!.patientName.value}") may not match the patient (${data.patient.fullName}).`} />}
            {(draft?.unreadableLineCount ?? 0) > 0 && <Banner tone="warning" title={`${draft!.unreadableLineCount} line(s) on the prescription couldn't be read.`} />}
            {hasH1 && <Banner tone="info" title="H1 medicine: the prescriber's registration number is required for the H1 register." />}
            {data.order.customerNote && <Banner tone="neutral" title={`Customer note: "${data.order.customerNote}"`} />}
            {!data.prescription && <Banner tone="warning" title="No prescription attached." />}
          </div>

          {data.prescription && (
            <section>
              <h2 className="mb-3 text-staff-section font-semibold text-ink">Prescription details</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <DetailField label="Prescriber" value={details.prescriberName} unsure={draft?.prescriberName.uncertain} onChange={(v) => setDetails({ ...details, prescriberName: v })} disabled={!editable} />
                <DetailField label="Registration no." value={details.prescriberRegNo} unsure={draft?.prescriberRegNo.uncertain} onChange={(v) => setDetails({ ...details, prescriberRegNo: v })} disabled={!editable} />
                <DetailField label="Prescription date" type="date" value={details.prescribedOn} unsure={draft?.prescribedOn.uncertain} onChange={(v) => setDetails({ ...details, prescribedOn: v })} disabled={!editable} />
                <DetailField label="Patient name on prescription" value={details.patientNameOnRx} unsure={draft?.patientName.uncertain} onChange={(v) => setDetails({ ...details, patientNameOnRx: v })} disabled={!editable} />
              </div>
            </section>
          )}

          {unmatchedLines.length > 0 && (
            <section>
              <h2 className="mb-2 text-staff-section font-semibold text-ink">Also on the prescription</h2>
              <ul className="divide-y divide-line border-y border-line bg-surface">
                {unmatchedLines.map((line) => (
                  <UnmatchedLine
                    key={line.lineIndex}
                    line={line}
                    disabled={!editable}
                    onAdd={(product) =>
                      setItems((list) => [
                        ...list,
                        { key: `new-${line.lineIndex}`, product, quantity: line.suggestedQuantity, decision: 'APPROVE', removedReason: '', dose: line.dose, doseNote: line.dose ? 'suggested from the text' : null, aiUnsure: line.uncertain, asNeeded: false, durationDays: line.durationDays, genericOptions: [], offerGenericId: null },
                      ])
                    }
                  />
                ))}
              </ul>
            </section>
          )}

          <section>
            <h2 className="mb-3 text-staff-section font-semibold text-ink">Medicines ({items.length})</h2>
            <div className="flex flex-col gap-4">
              {items.map((item, index) => (
                <ItemBlock key={item.key} index={index} item={item} editable={editable} onChange={(patch) => update(item.key, patch)} onDrop={() => setItems((l) => l.filter((i) => i.key !== item.key))} />
              ))}
            </div>
            {editable && (
              <Button variant="secondary" size="md" className="mt-3" icon={<Plus className="size-4" aria-hidden />} onClick={() => setSheet('add')}>
                Add medicine from the prescription
              </Button>
            )}
          </section>

          {editable && (
            <label className="flex cursor-pointer items-start gap-3 rounded-md border border-line bg-surface p-4">
              <input type="checkbox" className="mt-0.5 size-5 accent-pine" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
              <span className="text-staff-body text-ink">The prescription is valid and matches the patient, and I have checked every medicine above.</span>
            </label>
          )}
        </div>
      </div>

      {editable && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface shadow-overlay">
          <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
            <Button variant="secondary" size="md" onClick={() => setSheet('reupload')}>Request re-upload <kbd className="ml-1 text-staff-caption text-ink-3">U</kbd></Button>
            <Button variant="danger" size="md" onClick={() => setSheet('reject')}>Reject <kbd className="ml-1 text-staff-caption">R</kbd></Button>
            <p className="ml-auto text-staff-table text-ink-2">{missing.length ? `Still needed: ${missing.join(', ')}` : changed ? 'The customer will be asked to confirm the changes.' : 'Ready to approve.'}</p>
            <Button size="md" disabled={missing.length > 0} loading={approve.isPending} onClick={() => approve.mutate()}>
              {changed ? 'Approve & ask customer' : 'Approve & route'} <kbd className="ml-1 text-staff-caption opacity-70">A</kbd>
            </Button>
          </div>
          {error && (
            <div className="mx-auto max-w-[1440px] px-4 pb-3 sm:px-6">
              <Banner tone="danger" title={error} action={error.includes('reload') ? <Button size="sm" variant="secondary" onClick={onReload}>Reload</Button> : undefined} />
            </div>
          )}
        </div>
      )}

      <DecisionSheet kind={sheet === 'reject' || sheet === 'reupload' ? sheet : null} orderId={data.order.id} version={data.order.version} onClose={() => setSheet(null)} onDone={onDone} />
      <AddProductSheet
        open={sheet === 'add'}
        onClose={() => setSheet(null)}
        onAdd={(product) => {
          setItems((list) => [...list, { key: `add-${product.id}-${list.length}`, product, quantity: 1, decision: 'APPROVE', removedReason: '', dose: null, doseNote: null, asNeeded: false, durationDays: null, genericOptions: [], offerGenericId: null }]);
          setSheet(null);
        }}
      />
    </StaffLayout>
  );
}

function DetailField({ label: text, value, onChange, unsure, type = 'text', disabled }: { label: string; value: string; onChange: (v: string) => void; unsure?: boolean; type?: string; disabled?: boolean }) {
  return (
    <label className="block">
      <span className={label}>
        {text}
        {unsure && <span className="border-l-2 border-warning bg-warning-bg px-1.5 text-staff-caption font-medium text-warning">AI unsure</span>}
      </span>
      <input type={type} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className={cn(field, unsure && 'border-l-[3px] border-l-warning')} />
    </label>
  );
}

function ItemBlock({ index, item, editable, onChange, onDrop }: { index: number; item: EditItem; editable: boolean; onChange: (p: Partial<EditItem>) => void; onDrop: () => void }) {
  const [changing, setChanging] = useState(false);
  const removed = item.decision === 'REMOVE';
  const units = item.product.packUnits ? item.quantity * item.product.packUnits : null;
  const daily = item.dose ? item.dose.morning + item.dose.noon + item.dose.night : 0;
  const days = units && daily > 0 ? Math.floor(units / daily) : null;

  return (
    <article className={cn('rounded-md border bg-surface p-4', removed ? 'border-line opacity-70' : 'border-line')}>
      <div className="flex flex-wrap items-start gap-2">
        <span className="font-mono text-staff-table text-ink-3">{index + 1}</span>
        <div className="min-w-0 flex-1">
          <p className="text-staff-section font-semibold text-ink">
            {item.product.displayName}
            {item.aiUnsure && (
              <span className="ml-2 align-middle">
                <Pill tone="warning" size="staff">
                  AI unsure
                </Pill>
              </span>
            )}
          </p>
          <p className="text-staff-table text-ink-2">
            {item.product.brandName} · {item.product.packLabel} · {formatRupees(item.product.pricePaise)} per pack
          </p>
          {!item.itemId && <p className="text-staff-caption text-pine">Added by you</p>}
          {item.requestedQuantity !== undefined && item.requestedQuantity !== item.quantity && <p className="text-staff-caption text-ink-2">Customer asked for {item.requestedQuantity}</p>}
        </div>
        <ScheduleTag schedule={item.product.schedule} />
        {editable && !removed && (
          <Button variant="quiet" size="sm" icon={<Search className="size-4" aria-hidden />} onClick={() => setChanging(!changing)}>
            Change product
          </Button>
        )}
      </div>

      {changing && (
        <div className="mt-3">
          <ProductSearch onPick={(product) => { onChange({ product, offerGenericId: null, genericOptions: [] }); setChanging(false); }} />
        </div>
      )}

      {!removed && (
        <div className="mt-4 grid gap-4 sm:grid-cols-[auto_1fr]">
          <div>
            <span className={label}>
              Dose (morning · noon · night)
              {item.doseNote && <span className="text-staff-caption font-normal text-ink-3">{item.doseNote}</span>}
            </span>
            <div className="flex items-center gap-2">
              {(['morning', 'noon', 'night'] as const).map((slot) => (
                <select
                  key={slot}
                  aria-label={slot}
                  disabled={!editable || item.asNeeded}
                  value={item.dose?.[slot] ?? 0}
                  onChange={(e) => onChange({ dose: { morning: 0, noon: 0, night: 0, ...item.dose, [slot]: Number(e.target.value) }, doseNote: null })}
                  className="h-9 w-16 rounded-sm border border-line-strong bg-surface px-2 text-staff-body tabular-nums"
                >
                  {DOSES.map((d) => <option key={d} value={d}>{d === 0.5 ? '½' : d === 1.5 ? '1½' : d}</option>)}
                </select>
              ))}
            </div>
            <label className="mt-2 flex items-center gap-2 text-staff-table text-ink-2">
              <input type="checkbox" className="accent-pine" disabled={!editable} checked={item.asNeeded} onChange={(e) => onChange({ asNeeded: e.target.checked })} />
              As needed (no refill reminders)
            </label>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className={label}>Duration (days)</span>
              <input type="number" min={1} max={365} disabled={!editable} value={item.durationDays ?? ''} onChange={(e) => onChange({ durationDays: e.target.value ? Number(e.target.value) : null })} className={field} />
            </label>
            <div>
              <span className={label}>Quantity (packs)</span>
              <div className="flex items-center gap-1">
                <button type="button" aria-label="Fewer" disabled={!editable || item.quantity <= 1} onClick={() => onChange({ quantity: item.quantity - 1 })} className="grid size-9 place-items-center rounded-sm border border-line-strong disabled:text-ink-disabled"><Minus className="size-4" aria-hidden /></button>
                <span className="w-10 text-center text-staff-body tabular-nums">{item.quantity}</span>
                <button type="button" aria-label="More" disabled={!editable || item.quantity >= 30} onClick={() => onChange({ quantity: item.quantity + 1 })} className="grid size-9 place-items-center rounded-sm border border-line-strong disabled:text-ink-disabled"><Plus className="size-4" aria-hidden /></button>
              </div>
              {units && <p className="mt-1 text-staff-caption text-ink-2 tabular-nums">= {units} units{days ? ` = ${days} days at this dose` : ''}</p>}
            </div>
          </div>
        </div>
      )}

      {!removed && item.genericOptions.length > 0 && (
        <label className="mt-4 block">
          <span className={label}>Cheaper generic (customer chooses)</span>
          <select disabled={!editable} value={item.offerGenericId ?? ''} onChange={(e) => onChange({ offerGenericId: e.target.value || null })} className={field}>
            <option value="">Don't offer a generic</option>
            {item.genericOptions.map((g) => (
              <option key={g.id} value={g.id}>
                Offer {g.brandName} at {formatRupees(g.pricePaise)}/pack (saves {formatRupees((item.product.pricePaise - g.pricePaise) * item.quantity)})
              </option>
            ))}
          </select>
        </label>
      )}

      {editable && (
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-3">
          <div role="radiogroup" aria-label="Decision" className="flex gap-1">
            {(['APPROVE', 'REMOVE'] as const).map((d) => (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={item.decision === d}
                onClick={() => onChange({ decision: d })}
                className={cn('h-9 rounded-sm border px-3 text-staff-body font-medium', item.decision === d ? (d === 'APPROVE' ? 'border-pine bg-pine text-white' : 'border-danger bg-danger-bg text-danger') : 'border-line-strong text-ink-2')}
              >
                {d === 'APPROVE' ? 'Approve' : 'Remove'}
              </button>
            ))}
          </div>
          {removed && <input placeholder="Reason (shown to the customer)" value={item.removedReason} onChange={(e) => onChange({ removedReason: e.target.value })} className={cn(field, 'flex-1')} aria-label="Reason for removing" />}
          {!item.itemId && <Button variant="quiet" size="sm" onClick={onDrop}>Undo add</Button>}
        </div>
      )}
      {!editable && <p className="mt-3 text-staff-table text-ink-2">{removed ? 'Removed' : 'Approved'}</p>}
    </article>
  );
}

function UnmatchedLine({ line, onAdd, disabled }: { line: DraftLineDto; onAdd: (p: ProductSummaryDto) => void; disabled: boolean }) {
  const [picking, setPicking] = useState(false);
  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-staff-table text-ink">{line.asWritten}</span>
        <Pill tone={line.quality === 'NONE' ? 'warning' : 'neutral'} size="staff">{line.quality === 'NONE' ? 'No catalog match' : 'Not in the order'}</Pill>
        {line.uncertain && <Pill tone="warning" size="staff">AI unsure</Pill>}
        {!disabled && <Button variant="secondary" size="sm" className="ml-auto" onClick={() => (line.product ? onAdd(line.product) : setPicking(!picking))}>{line.product ? `Add ${line.product.displayName}` : 'Find product'}</Button>}
      </div>
      {picking && <div className="mt-2"><ProductSearch initial={line.medicineName ?? ''} onPick={(p) => { onAdd(p); setPicking(false); }} /></div>}
    </li>
  );
}

function ProductSearch({ onPick, initial = '' }: { onPick: (p: ProductSummaryDto & { packUnits?: number }) => void; initial?: string }) {
  const [q, setQ] = useState(initial.replace(/\d+.*$/, '').trim() || initial);
  const results = useQuery({
    queryKey: ['ph-products', q],
    queryFn: () => api.get<(ProductSummaryDto & { blocked: boolean })[]>(`/pharmacist/products?q=${encodeURIComponent(q)}`),
    enabled: q.trim().length >= 2,
  });
  return (
    <div className="rounded-sm border border-line bg-canvas p-2">
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search catalog: name, molecule or brand" className={field} aria-label="Search catalog" />
      <ul className="mt-2 max-h-56 overflow-y-auto">
        {results.data?.length === 0 && <li className="px-2 py-2 text-staff-table text-ink-2">No products found.</li>}
        {results.data?.map((p) => (
          <li key={p.id}>
            <button type="button" disabled={p.blocked} onClick={() => onPick(p)} className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-staff-table hover:bg-surface disabled:cursor-not-allowed disabled:text-ink-disabled">
              <span className="flex-1">{p.displayName} <span className="text-ink-3">· {p.brandName} · {p.packLabel} · {formatRupees(p.pricePaise)}</span></span>
              <ScheduleTag schedule={p.schedule} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AddProductSheet({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (p: ProductSummaryDto) => void }) {
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} title="Add a medicine">
      <ProductSearch onPick={onAdd} />
    </Sheet>
  );
}

const REASON_LABELS: Record<string, string> = {
  PRESCRIPTION_INVALID: 'Prescription not valid',
  PRESCRIPTION_EXPIRED: 'Prescription expired',
  PATIENT_MISMATCH: 'Patient does not match',
  PRESCRIBER_DETAILS_MISSING: 'Prescriber details missing',
  NOT_ON_PRESCRIPTION: 'Medicines not on the prescription',
  DUPLICATE_ORDER: 'Duplicate order',
  OTHER: 'Other (explain)',
  BLURRY: 'Blurry',
  CROPPED: 'Part of the page cut off',
  GLARE: 'Glare',
  WRONG_DOCUMENT: 'Not the prescription',
  PAGE_MISSING: 'A page is missing',
};

function DecisionSheet({ kind, orderId, version, onClose, onDone }: { kind: 'reject' | 'reupload' | null; orderId: string; version: number; onClose: () => void; onDone: (m: string) => void }) {
  const reasons = useMemo(() => (kind === 'reject' ? REJECTION_REASONS : REUPLOAD_REASONS), [kind]);
  const [reason, setReason] = useState<string>('');
  const [note, setNote] = useState('');
  useEffect(() => {
    setReason('');
    setNote('');
  }, [kind]);
  const submit = useMutation({
    mutationFn: () => api.post(`/pharmacist/orders/${orderId}/${kind === 'reject' ? 'reject' : 'request-reupload'}`, { version, reason, note: note.trim() || undefined }),
    onSuccess: () => onDone(kind === 'reject' ? 'Order rejected; the customer has been told why.' : 'Re-upload requested; the customer has been asked for a clearer photo.'),
  });
  return (
    <Sheet open={kind !== null} onOpenChange={(o) => !o && onClose()} title={kind === 'reject' ? 'Reject this order' : 'Request a new photo'} description="The customer sees the reason in plain language.">
      <div lang="en" className="flex flex-col gap-4">
        <div className="flex flex-col gap-2" role="radiogroup" aria-label="Reason">
          {reasons.map((r) => (
            <label key={r} className={cn('flex cursor-pointer items-center gap-3 rounded-sm border px-3 py-2.5 text-staff-body', reason === r ? 'border-pine bg-pine-subtle' : 'border-line-strong')}>
              <input type="radio" name="reason" className="accent-pine" checked={reason === r} onChange={() => setReason(r)} />
              {REASON_LABELS[r]}
            </label>
          ))}
        </div>
        <label className="block">
          <span className={label}>Note {reason === 'OTHER' ? '(required)' : '(optional)'}</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className="w-full rounded-sm border border-line-strong bg-surface p-3 text-staff-body" />
        </label>
        {submit.error && <Banner tone="danger" title={errorMessage(submit.error, t)} />}
        <Button variant={kind === 'reject' ? 'danger' : 'primary'} size="lg" fullWidth disabled={!reason || (reason === 'OTHER' && !note.trim())} loading={submit.isPending} onClick={() => submit.mutate()}>
          {kind === 'reject' ? 'Reject order' : 'Request new photo'}
        </Button>
      </div>
    </Sheet>
  );
}

/** Zoom and rotate the prescription; the image is fetched with the session (never a public link). */
function PrescriptionViewer({ prescriptionId }: { prescriptionId: string | null }) {
  const [url, setUrl] = useState<string>();
  const [failed, setFailed] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  useEffect(() => {
    if (!prescriptionId) return;
    let objectUrl: string | undefined;
    void fetch(`/api/prescriptions/${prescriptionId}/image`, { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.blob() : Promise.reject()))
      .then((b) => setUrl((objectUrl = URL.createObjectURL(b))))
      .catch(() => setFailed(true));
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [prescriptionId]);

  return (
    <section aria-label="Prescription image" className="lg:sticky lg:top-4 lg:self-start">
      <div className="flex items-center gap-1 rounded-t-md border border-b-0 border-line bg-surface px-2 py-1.5">
        <Button variant="quiet" size="sm" aria-label="Zoom out" icon={<ZoomOut className="size-4" aria-hidden />} onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))} />
        <span className="w-12 text-center text-staff-caption tabular-nums text-ink-2">{Math.round(zoom * 100)}%</span>
        <Button variant="quiet" size="sm" aria-label="Zoom in" icon={<ZoomIn className="size-4" aria-hidden />} onClick={() => setZoom((z) => Math.min(3, z + 0.25))} />
        <Button variant="quiet" size="sm" onClick={() => setZoom(1)}>Fit</Button>
        <Button variant="quiet" size="sm" aria-label="Rotate" icon={<RotateCw className="size-4" aria-hidden />} onClick={() => setRotation((r) => (r + 90) % 360)} />
      </div>
      <div className="h-[50vh] overflow-auto rounded-b-md border border-line bg-[#e7e5de] lg:h-[calc(100vh-200px)]">
        {!prescriptionId && <p className="p-6 text-staff-body text-ink-2">No prescription image.</p>}
        {failed && <p className="p-6 text-staff-body text-danger">The image couldn't be loaded.</p>}
        {prescriptionId && !url && !failed && <Skeleton className="m-4 h-[80%]" />}
        {url && (
          <img
            src={url}
            alt="Uploaded prescription"
            className="origin-top-left transition-transform duration-180"
            style={{ width: `${zoom * 100}%`, maxWidth: 'none', transform: rotation ? `rotate(${rotation}deg)` : undefined, transformOrigin: 'center' }}
          />
        )}
      </div>
    </section>
  );
}
