import { useQuery } from '@tanstack/react-query';
import { Banner } from '../../design-system/Banner';
import { ErrorState, Skeleton } from '../../design-system/States';
import i18n from '../../i18n';
import { tableClasses as tc } from '../../layouts/StaffLayout';
import { api } from '../../lib/api';
import { errorMessage } from '../../lib/errors';
import { WaitingOrders } from './StockTab';

interface Overview {
  stores: { code: string; name: string; today: number; week: number; open: number }[];
  notRouted: { today: number; week: number };
  verification: { decided: number; medianMinutes: number | null; p90Minutes: number | null; waitingNow: number };
  rejections: { reason: string; count: number }[];
  safety: { unapproved: number; dispatched: number };
}

const REASON_LABEL: Record<string, string> = {
  PRESCRIPTION_INVALID: 'Prescription not valid',
  PRESCRIPTION_EXPIRED: 'Prescription expired',
  PATIENT_MISMATCH: 'Patient name does not match',
  PRESCRIBER_DETAILS_MISSING: 'Doctor details missing',
  NOT_ON_PRESCRIPTION: 'Medicine not on prescription',
  DUPLICATE_ORDER: 'Duplicate order',
  OTHER: 'Other',
};

const minutes = (value: number | null) => (value === null ? '–' : `${value.toFixed(1)} min`);

/** O1 Overview: one view of all stores. Plain tables, on purpose (plan O1). */
export function OverviewTab() {
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['ops', 'overview'],
    queryFn: () => api.get<Overview>('/ops/overview'),
  });

  if (isPending) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-14" />
        <Skeleton className="h-64" />
      </div>
    );
  }
  if (isError) return <ErrorState message={errorMessage(error, i18n.t.bind(i18n))} onRetry={() => void refetch()} />;

  const safe = data.safety.unapproved === 0;
  const onTarget = data.verification.medianMinutes !== null && data.verification.medianMinutes < 10;

  return (
    <div className="flex flex-col gap-8">
      <Banner
        tone={safe ? 'success' : 'danger'}
        title={`H/H1 items dispatched without approval: ${data.safety.unapproved}`}
      >
        Measured across {data.safety.dispatched} dispatched H/H1 items. The database refuses any dispatch without
        approval.
      </Banner>

      <section>
        <h2 className="text-staff-section font-semibold text-ink">Orders by store</h2>
        <div className={`mt-3 ${tc.wrap}`}>
          <table className={tc.table}>
            <thead className={tc.head}>
              <tr>
                <th className={tc.th}>Store</th>
                <th className={`${tc.th} text-right`}>Today</th>
                <th className={`${tc.th} text-right`}>Last 7 days</th>
                <th className={`${tc.th} text-right`}>In fulfilment now</th>
              </tr>
            </thead>
            <tbody>
              {data.stores.map((store) => (
                <tr key={store.code} className={tc.row}>
                  <td className={tc.td}>{store.name}</td>
                  <td className={`${tc.td} text-right tabular-nums`}>{store.today}</td>
                  <td className={`${tc.td} text-right tabular-nums`}>{store.week}</td>
                  <td className={`${tc.td} text-right tabular-nums`}>{store.open}</td>
                </tr>
              ))}
              <tr className={tc.row}>
                <td className={`${tc.td} text-ink-2`}>Not routed to a store yet</td>
                <td className={`${tc.td} text-right tabular-nums text-ink-2`}>{data.notRouted.today}</td>
                <td className={`${tc.td} text-right tabular-nums text-ink-2`}>{data.notRouted.week}</td>
                <td className={`${tc.td} text-right text-ink-2`}>–</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <h2 className="text-staff-section font-semibold text-ink">Verification, last 7 days</h2>
          <div className={`mt-3 ${tc.wrap}`}>
            <table className={tc.table}>
              <tbody>
                <tr>
                  <th scope="row" className={`${tc.td} font-normal`}>
                    Median, placed to decision
                  </th>
                  <td className={`${tc.td} text-right tabular-nums`}>
                    {minutes(data.verification.medianMinutes)}
                    {data.verification.medianMinutes !== null && (
                      <span className={onTarget ? 'ml-2 text-success' : 'ml-2 text-danger'}>
                        {onTarget ? 'under 10 min target' : 'over 10 min target'}
                      </span>
                    )}
                  </td>
                </tr>
                <tr className={tc.row}>
                  <th scope="row" className={`${tc.td} font-normal`}>
                    90th percentile
                  </th>
                  <td className={`${tc.td} text-right tabular-nums`}>{minutes(data.verification.p90Minutes)}</td>
                </tr>
                <tr className={tc.row}>
                  <th scope="row" className={`${tc.td} font-normal`}>
                    Orders decided
                  </th>
                  <td className={`${tc.td} text-right tabular-nums`}>{data.verification.decided}</td>
                </tr>
                <tr className={tc.row}>
                  <th scope="row" className={`${tc.td} font-normal`}>
                    Waiting for a pharmacist now
                  </th>
                  <td className={`${tc.td} text-right tabular-nums`}>{data.verification.waitingNow}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="text-staff-section font-semibold text-ink">Rejections, last 7 days</h2>
          {data.rejections.length === 0 ? (
            <p className="mt-3 text-staff-body text-ink-2">No orders were rejected.</p>
          ) : (
            <div className={`mt-3 ${tc.wrap}`}>
              <table className={tc.table}>
                <thead className={tc.head}>
                  <tr>
                    <th className={tc.th}>Reason</th>
                    <th className={`${tc.th} text-right`}>Orders</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rejections.map((row) => (
                    <tr key={row.reason} className={tc.row}>
                      <td className={tc.td}>{REASON_LABEL[row.reason] ?? row.reason}</td>
                      <td className={`${tc.td} text-right tabular-nums`}>{row.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <WaitingOrders />
    </div>
  );
}
