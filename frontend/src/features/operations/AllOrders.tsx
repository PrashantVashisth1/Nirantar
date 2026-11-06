import { ORDER_STATUSES, formatRupees, type OrderStatus } from '@nirantar/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorState, Skeleton } from '../../design-system/States';
import { tableClasses as tc } from '../../layouts/StaffLayout';
import { api } from '../../lib/api';
import { errorMessage } from '../../lib/errors';
import { formatDateTime } from '../../lib/format';

interface OrderRow {
  id: string;
  number: string;
  status: OrderStatus;
  itemsSummary: string;
  totalPaise: number;
  storeName: string | null;
  placedAt: string;
}

const select = 'h-9 rounded-sm border border-line-strong bg-surface px-3 text-staff-body';

/** The client's "one view of orders across all stores": newest first, with filters. */
export function AllOrders() {
  const { t, i18n } = useTranslation();
  const [storeId, setStoreId] = useState('');
  const [status, setStatus] = useState('');
  const stores = useQuery({
    queryKey: ['ops', 'stores'],
    queryFn: () => api.get<{ id: string; name: string }[]>('/ops/stores'),
  });
  const orders = useQuery({
    queryKey: ['ops', 'orders', storeId, status],
    queryFn: () => {
      const params = new URLSearchParams();
      if (storeId) params.set('storeId', storeId);
      if (status) params.set('status', status);
      return api.get<{ orders: OrderRow[]; total: number }>(`/ops/orders?${params}`);
    },
    placeholderData: keepPreviousData,
  });

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-staff-section font-semibold text-ink">All orders</h2>
          {orders.data && (
            <p className="mt-1 text-staff-body text-ink-2">
              Showing {orders.data.orders.length} of {orders.data.total}, newest first.
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <select aria-label="Filter by store" className={select} value={storeId} onChange={(e) => setStoreId(e.target.value)}>
            <option value="">All stores</option>
            {stores.data?.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </select>
          <select aria-label="Filter by status" className={select} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {ORDER_STATUSES.map((value) => (
              <option key={value} value={value}>
                {value.replaceAll('_', ' ').toLowerCase()}
              </option>
            ))}
          </select>
        </div>
      </div>

      {orders.isPending && <Skeleton className="mt-3 h-48" />}
      {orders.isError && !orders.data && <ErrorState message={errorMessage(orders.error, t)} onRetry={() => void orders.refetch()} />}
      {orders.data?.orders.length === 0 && <p className="mt-3 text-staff-body text-ink-2">No orders match these filters.</p>}
      {orders.data && orders.data.orders.length > 0 && (
        <div className={`mt-3 ${tc.wrap}`}>
          <table className={tc.table}>
            <thead className={tc.head}>
              <tr>
                <th className={tc.th}>Order</th>
                <th className={tc.th}>Placed</th>
                <th className={tc.th}>Store</th>
                <th className={tc.th}>Status</th>
                <th className={tc.th}>Medicines</th>
                <th className={`${tc.th} text-right`}>Total</th>
              </tr>
            </thead>
            <tbody>
              {orders.data.orders.map((order) => (
                <tr key={order.id} className={tc.row}>
                  <td className={`${tc.td} font-mono`}>{order.number}</td>
                  <td className={tc.td}>{formatDateTime(order.placedAt, i18n.language)}</td>
                  <td className={tc.td}>{order.storeName ?? <span className="text-ink-2">Not routed yet</span>}</td>
                  <td className={tc.td}>{t(`status.${order.status}`)}</td>
                  <td className={tc.td}>{order.itemsSummary}</td>
                  <td className={`${tc.td} text-right tabular-nums`}>{formatRupees(order.totalPaise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
