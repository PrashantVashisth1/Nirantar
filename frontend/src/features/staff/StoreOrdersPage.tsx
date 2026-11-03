import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatRupees, type StoreOrderDto } from '@nirantar/shared';
import { useState } from 'react';
import { Banner } from '../../design-system/Banner';
import { Pill, ScheduleTag } from '../../design-system/Badge';
import { Button } from '../../design-system/Button';
import { AllDoneIllustration } from '../../design-system/Illustrations';
import { ErrorState, Skeleton } from '../../design-system/States';
import i18n from '../../i18n';
import { StaffLayout } from '../../layouts/StaffLayout';
import { api } from '../../lib/api';
import { cn } from '../../lib/cn';
import { errorMessage } from '../../lib/errors';
import { formatDateTime } from '../../lib/format';
import { useMe } from '../../lib/session';

type Tab = 'to_pick' | 'packed' | 'out' | 'delivered';
const TABS: { key: Tab; label: string }[] = [
  { key: 'to_pick', label: 'To pick' },
  { key: 'packed', label: 'Packed' },
  { key: 'out', label: 'Out for delivery' },
  { key: 'delivered', label: 'Delivered today' },
];
const t = i18n.t.bind(i18n);

/** S1: the pharmacist's own store. Every step is re-checked by the database dispatch gate. */
export function StoreOrdersPage() {
  const { data: me } = useMe();
  const [tab, setTab] = useState<Tab>('to_pick');
  const orders = useQuery({
    queryKey: ['store', tab],
    queryFn: () => api.get<StoreOrderDto[]>(`/pharmacist/store/orders?tab=${tab}`),
    refetchInterval: 20_000,
  });
  const counts = useQuery({
    queryKey: ['store', 'counts'],
    queryFn: () => api.get<Record<string, number>>('/pharmacist/store/counts'),
    refetchInterval: 20_000,
  });

  return (
    <StaffLayout>
      <h1 className="text-staff-title font-semibold text-ink">{me?.store?.name} store · Orders</h1>
      <p className="mt-1 text-staff-body text-ink-2">Orders routed to your store after a pharmacist approved every item.</p>
      <div className="mt-4 flex gap-1 overflow-x-auto border-b border-line" role="tablist">
        {TABS.map((item) => (
          <button
            key={item.key}
            role="tab"
            aria-selected={tab === item.key}
            onClick={() => setTab(item.key)}
            className={cn('-mb-px h-10 shrink-0 border-b-2 px-3 text-staff-body font-medium', tab === item.key ? 'border-pine text-ink' : 'border-transparent text-ink-2 hover:text-ink')}
          >
            {item.label}
            {counts.data?.[item.key] ? <span className="ml-1.5 rounded-full bg-sunken px-1.5 text-staff-caption tabular-nums">{counts.data[item.key]}</span> : null}
          </button>
        ))}
      </div>
      <div className="mt-5">
        {orders.isLoading && <Skeleton className="h-48 w-full" />}
        {orders.isError && <ErrorState message={errorMessage(orders.error, t)} onRetry={() => void orders.refetch()} />}
        {orders.data?.length === 0 && (
          <div className="flex flex-col items-center gap-3 border-y border-line bg-surface py-12 text-center">
            <AllDoneIllustration />
            <p className="text-staff-section font-semibold text-ink">Nothing here right now</p>
          </div>
        )}
        <div className="grid gap-4 xl:grid-cols-2">
          {orders.data?.map((order) => <StoreOrderCard key={order.id} order={order} />)}
        </div>
      </div>
    </StaffLayout>
  );
}

function StoreOrderCard({ order }: { order: StoreOrderDto }) {
  const queryClient = useQueryClient();
  const [invoice, setInvoice] = useState('');
  const [rider, setRider] = useState('');
  const [error, setError] = useState<string>();
  const step = useMutation({
    mutationFn: (args: { path: string; body?: object }) => api.post(`/pharmacist/store/orders/${order.id}/${args.path}`, { version: order.version, ...args.body }),
    onSuccess: () => {
      setError(undefined);
      void queryClient.invalidateQueries({ queryKey: ['store'] });
    },
    onError: (e) => setError(errorMessage(e, t)),
  });
  const unpaidUpi = order.paymentMethod === 'UPI_TEST' && order.paymentStatus !== 'PAID';
  const field = 'h-9 min-w-0 flex-1 rounded-sm border border-line-strong bg-surface px-3 text-staff-body';

  return (
    <article className="rounded-md border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-staff-body font-semibold text-ink">{order.number}</span>
        <span className="text-staff-body text-ink-2">{order.patientName}</span>
        <span className="ml-auto">
          <Pill tone={order.paymentStatus === 'PAID' || order.paymentStatus === 'COD_COLLECTED' ? 'success' : unpaidUpi ? 'warning' : 'neutral'} size="staff">
            {order.paymentMethod === 'COD' ? `Cash on delivery · ${formatRupees(order.totalPaise)}` : order.paymentStatus === 'PAID' ? 'UPI paid' : 'UPI not paid yet'}
          </Pill>
        </span>
      </div>
      {order.approvedBy && <p className="mt-1 text-staff-caption text-ink-2">Approved by {order.approvedBy.name} ({order.approvedBy.regNo})</p>}
      {order.promisedBy && order.status !== 'DELIVERED' && <p className="text-staff-caption text-ink-2">Promised by {formatDateTime(order.promisedBy, 'en')}</p>}

      <ul className="mt-3 divide-y divide-line border-y border-line">
        {order.items.map((item, i) => (
          <li key={i} className="flex items-center gap-2 py-2 text-staff-table">
            <span className="w-8 tabular-nums font-semibold">{item.quantity}×</span>
            <span className="flex-1">{item.name} <span className="text-ink-3">· {item.brand} · {item.packLabel}</span></span>
            <ScheduleTag schedule={item.schedule} />
          </li>
        ))}
      </ul>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {order.status === 'ASSIGNED' && <Button size="md" loading={step.isPending} onClick={() => step.mutate({ path: 'start-picking' })}>Start picking</Button>}
        {order.status === 'PICKING' && (
          <>
            <input className={field} placeholder="Store invoice no." aria-label="Store invoice number" value={invoice} onChange={(e) => setInvoice(e.target.value)} />
            <Button size="md" disabled={!invoice.trim()} loading={step.isPending} onClick={() => step.mutate({ path: 'pack', body: { invoiceNo: invoice.trim() } })}>Mark packed</Button>
          </>
        )}
        {order.status === 'PACKED' && (
          <>
            <span className="w-full text-staff-caption text-ink-2">Invoice {order.invoiceNo}</span>
            <input className={field} placeholder="Delivery person's name" aria-label="Delivery person's name" value={rider} onChange={(e) => setRider(e.target.value)} />
            <Button size="md" disabled={!rider.trim() || unpaidUpi} loading={step.isPending} onClick={() => step.mutate({ path: 'handover', body: { riderName: rider.trim() } })}>Hand over</Button>
            {unpaidUpi && <p className="w-full text-staff-caption text-warning">Waiting for the customer's UPI payment (or for them to switch to cash).</p>}
          </>
        )}
        {order.status === 'OUT_FOR_DELIVERY' && (
          <>
            <span className="text-staff-table text-ink-2">With {order.riderName}</span>
            <Button size="md" className="ml-auto" loading={step.isPending} onClick={() => step.mutate({ path: 'deliver' })}>Mark delivered</Button>
          </>
        )}
        {order.status === 'DELIVERED' && <span className="text-staff-table text-success">Delivered · invoice {order.invoiceNo}</span>}
      </div>
      {error && <Banner tone="danger" className="mt-3" title={error} />}
    </article>
  );
}
