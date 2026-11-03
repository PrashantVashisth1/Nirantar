import { useQuery } from '@tanstack/react-query';
import type { OrderSummaryDto } from '@nirantar/shared';
import { LogOut } from 'lucide-react';
import { useNavigate } from 'react-router';
import { Button } from '../../design-system/Button';
import { AllDoneIllustration } from '../../design-system/Illustrations';
import { ErrorState, Skeleton } from '../../design-system/States';
import { api } from '../../lib/api';
import { errorMessage } from '../../lib/errors';
import { useMe, useSignOut } from '../../lib/session';
import i18n from '../../i18n';

/**
 * Day 2 staff landing. Pharmacists see the live verification queue
 * (read-only for now; the side-by-side workspace arrives on Day 5).
 * Operations sees the store list (stock import arrives on Day 3).
 */
export function StaffHomePage() {
  const { data: me } = useMe();
  const signOut = useSignOut();
  const navigate = useNavigate();
  if (!me) return null;

  return (
    <div lang="en" className="min-h-dvh bg-canvas">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-4 px-6">
          <span className="text-staff-section font-semibold text-pine">Nirantar</span>
          <span className="text-staff-table text-ink-3">
            {me.role === 'PHARMACIST' ? 'Pharmacist' : 'Central operations'}
          </span>
          <div className="ml-auto flex items-center gap-4">
            <span className="text-staff-table text-ink-2">
              {me.name}
              {me.pharmacistRegNo && <span className="text-ink-3"> · {me.pharmacistRegNo}</span>}
              {me.store && <span className="text-ink-3"> · {me.store.name}</span>}
            </span>
            <Button
              variant="quiet"
              size="sm"
              icon={<LogOut className="size-4" aria-hidden />}
              loading={signOut.isPending}
              onClick={() => signOut.mutate(undefined, { onSuccess: () => navigate('/signin', { replace: true }) })}
            >
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1440px] px-6 py-8">
        {me.role === 'PHARMACIST' ? <QueuePreview /> : <StoresPreview />}
      </main>
    </div>
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

function StoresPreview() {
  const stores = useQuery({
    queryKey: ['ops', 'stores'],
    queryFn: () => api.get<{ id: string; code: string; name: string; isActive: boolean }[]>('/ops/stores'),
  });
  return (
    <section>
      <h1 className="text-staff-title font-semibold text-ink">Stores</h1>
      <p className="mt-1 text-staff-body text-ink-2">
        6 synthetic stores for the prototype (the real chain has 46).
      </p>
      {stores.isLoading && <Skeleton className="mt-6 h-40 w-full" />}
      {stores.isError && (
        <div className="mt-6">
          <ErrorState message={errorMessage(stores.error, i18n.t)} onRetry={() => void stores.refetch()} />
        </div>
      )}
      {stores.data && (
        <ul className="mt-6 divide-y divide-line border-y border-line bg-surface">
          {stores.data.map((store) => (
            <li key={store.id} className="flex h-11 items-center gap-4 px-4 text-staff-table">
              <span className="w-12 font-mono text-ink-2">{store.code}</span>
              <span className="text-ink">{store.name}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function waitingMinutes(placedAt: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(placedAt).getTime()) / 60_000));
}
