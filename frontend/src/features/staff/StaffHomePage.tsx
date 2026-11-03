import { useQuery } from '@tanstack/react-query';
import type { OrderSummaryDto } from '@nirantar/shared';
import { AllDoneIllustration } from '../../design-system/Illustrations';
import { ErrorState, Skeleton } from '../../design-system/States';
import { api } from '../../lib/api';
import { errorMessage } from '../../lib/errors';
import { StaffLayout } from '../../layouts/StaffLayout';
import i18n from '../../i18n';

/**
 * Day 2 staff landing. Pharmacists see the live verification queue
 * (read-only for now; the side-by-side workspace arrives on Day 5).
 */
export function StaffHomePage() {
  return (
    <StaffLayout>
      <QueuePreview />
    </StaffLayout>
  );
}

function QueuePreview() {
  const queue = useQuery({
    queryKey: ['queue'],
    queryFn: () => api.get<{ rows: OrderSummaryDto[] }>('/pharmacist/queue'),
    refetchInterval: 15_000,
  });

  return (
    <section>
      <h1 className="text-staff-title font-semibold text-ink">Verification queue</h1>
      <p className="mt-1 text-staff-body text-ink-2">Oldest first. Refreshes every 15 seconds.</p>
      <div className="mt-6 overflow-x-auto border-y border-line bg-surface">
        {queue.isLoading && (
          <div className="flex flex-col gap-2 p-4">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        )}
        {queue.isError && (
          <div className="p-4">
            <ErrorState message={errorMessage(queue.error, i18n.t)} onRetry={() => void queue.refetch()} />
          </div>
        )}
        {queue.data && queue.data.rows.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <AllDoneIllustration />
            <p className="text-staff-section font-semibold text-ink">All caught up</p>
            <p className="text-staff-body text-ink-2">New orders appear here automatically.</p>
          </div>
        )}
        {queue.data && queue.data.rows.length > 0 && (
          <table className="w-full min-w-[640px] text-left text-staff-table">
            <thead className="bg-sunken text-staff-caption font-medium text-ink-2">
              <tr>
                <th className="px-4 py-2.5 font-medium">Waiting</th>
                <th className="px-4 py-2.5 font-medium">Order</th>
                <th className="px-4 py-2.5 font-medium">Patient</th>
                <th className="px-4 py-2.5 font-medium">Items</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {queue.data.rows.map((row) => (
                <tr key={row.id} className="h-11">
                  <td className="px-4 tabular-nums">{waitingMinutes(row.placedAt)} min</td>
                  <td className="px-4 font-mono">{row.number}</td>
                  <td className="px-4">{row.patient.fullName}</td>
                  <td className="px-4 text-ink-2">{row.itemsSummary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function waitingMinutes(placedAt: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(placedAt).getTime()) / 60_000));
}
