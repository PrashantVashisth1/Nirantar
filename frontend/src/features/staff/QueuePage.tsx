import { useMutation, useQuery } from '@tanstack/react-query';
import type { QueueRowDto } from '@nirantar/shared';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Pill, ScheduleTag, type Tone } from '../../design-system/Badge';
import { Banner } from '../../design-system/Banner';
import { Button } from '../../design-system/Button';
import { AllDoneIllustration } from '../../design-system/Illustrations';
import { ErrorState, Skeleton } from '../../design-system/States';
import i18n from '../../i18n';
import { StaffLayout, tableClasses as tc } from '../../layouts/StaffLayout';
import { api } from '../../lib/api';
import { cn } from '../../lib/cn';
import { errorMessage } from '../../lib/errors';

interface Queue {
  rows: QueueRowDto[];
  summary: { waiting: number; oldestMinutes: number; medianTodayMinutes: number | null };
}

const FILTERS = [
  { key: 'all', label: 'All', test: () => true },
  { key: 'new', label: 'New', test: (r: QueueRowDto) => r.source === 'NEW' && !r.reupload },
  { key: 'refill', label: 'Refills', test: (r: QueueRowDto) => r.source === 'REFILL' },
  { key: 'reupload', label: 'Re-uploaded', test: (r: QueueRowDto) => r.reupload },
  { key: 'ai', label: 'AI unsure / failed', test: (r: QueueRowDto) => r.aiStatus === 'UNSURE' || r.aiStatus === 'FAILED' || r.aiStatus === 'UNREADABLE' },
] as const;

const AI_LABEL: Record<string, { label: string; tone: Tone }> = {
  READY: { label: 'Ready', tone: 'success' },
  UNSURE: { label: 'Unsure', tone: 'warning' },
  UNREADABLE: { label: "Couldn't read", tone: 'warning' },
  FAILED: { label: 'Manual entry', tone: 'neutral' },
  READING: { label: 'Reading…', tone: 'info' },
};

const minutesSince = (iso: string) => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
const waitTone = (m: number) => (m > 10 ? 'text-danger font-semibold' : m >= 5 ? 'text-warning font-semibold' : 'text-ink');

/** P1: what's waiting, oldest first; one click into the next order. */
export function QueuePage() {
  const navigate = useNavigate();
  const flash = (useLocation().state as { message?: string } | null)?.message;
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['key']>('all');
  const queue = useQuery({ queryKey: ['queue'], queryFn: () => api.get<Queue>('/pharmacist/queue'), refetchInterval: 15_000 });
  const next = useMutation({
    mutationFn: () => api.post<{ orderId: string } | undefined>('/pharmacist/queue/next'),
    onSuccess: (result) => result && navigate(`/pharmacist/orders/${result.orderId}`),
  });

  const rows = queue.data?.rows.filter(FILTERS.find((f) => f.key === filter)!.test) ?? [];
  const s = queue.data?.summary;

  return (
    <StaffLayout>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-staff-title font-semibold text-ink">Verification queue</h1>
          {s && (
            <p className="mt-1 text-staff-body text-ink-2 tabular-nums">
              {s.waiting} waiting · oldest {s.oldestMinutes} min{s.medianTodayMinutes !== null && ` · median today ${s.medianTodayMinutes} min`} · target under 10 min
            </p>
          )}
        </div>
        <Button size="md" disabled={!s?.waiting} loading={next.isPending} onClick={() => next.mutate()}>
          Start next
        </Button>
      </div>

      <div className="mt-5 flex flex-wrap gap-1.5" role="tablist" aria-label="Filter">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            role="tab"
            aria-selected={filter === f.key}
            onClick={() => setFilter(f.key)}
            className={cn('h-8 rounded-full border px-3 text-staff-table font-medium', filter === f.key ? 'border-pine bg-pine-subtle text-pine' : 'border-line-strong bg-surface text-ink-2 hover:bg-sunken')}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {flash && <Banner tone="success" className="mb-3" title={flash} />}
        {next.data === undefined && next.isSuccess && <Banner tone="info" title="Nothing is waiting right now." />}
        {queue.isLoading && <Skeleton className="h-56 w-full" />}
        {queue.isError && <ErrorState message={errorMessage(queue.error, i18n.t.bind(i18n))} onRetry={() => void queue.refetch()} />}
        {queue.data && rows.length === 0 && (
          <div className="flex flex-col items-center gap-3 border-y border-line bg-surface py-12 text-center">
            <AllDoneIllustration />
            <p className="text-staff-section font-semibold text-ink">All caught up</p>
            <p className="text-staff-body text-ink-2">{filter === 'all' ? 'New orders appear here automatically.' : 'Nothing in this filter.'}</p>
          </div>
        )}
        {rows.length > 0 && (
          <>
            {/* Phone: one card per order */}
            <ul className="divide-y divide-line border-y border-line bg-surface md:hidden">
              {rows.map((row) => (
                <li key={row.id}>
                  <button className="flex w-full flex-col gap-1 px-4 py-3 text-left hover:bg-canvas" onClick={() => navigate(`/pharmacist/orders/${row.id}`)}>
                    <span className="flex items-center gap-2 text-staff-table">
                      <span className={cn('tabular-nums', waitTone(minutesSince(row.placedAt)))}>{minutesSince(row.placedAt)} min</span>
                      <span className="font-mono text-ink-2">{row.number}</span>
                      {row.aiStatus && <Pill tone={AI_LABEL[row.aiStatus]!.tone} size="staff">{AI_LABEL[row.aiStatus]!.label}</Pill>}
                    </span>
                    <span className="text-staff-body text-ink">{row.patient.fullName}{row.ageYears && `, ${row.ageYears}`}</span>
                    <span className="text-staff-table text-ink-2">{row.itemsSummary}</span>
                  </button>
                </li>
              ))}
            </ul>
            {/* Tablet and desktop: table */}
            <div className={`hidden md:block ${tc.wrap}`}>
              <table className={tc.table}>
                <thead className={tc.head}>
                  <tr>
                    <th className={tc.th}>Waiting</th>
                    <th className={tc.th}>Order</th>
                    <th className={tc.th}>Patient</th>
                    <th className={`${tc.th} hidden lg:table-cell`}>Type</th>
                    <th className={tc.th}>Items</th>
                    <th className={tc.th}>AI draft</th>
                    <th className={`${tc.th} hidden lg:table-cell`}>Being reviewed by</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const minutes = minutesSince(row.placedAt);
                    return (
                      <tr key={row.id} className={`${tc.row} cursor-pointer hover:bg-canvas`} onClick={() => navigate(`/pharmacist/orders/${row.id}`)}>
                        <td className={cn(tc.td, 'tabular-nums', waitTone(minutes))}>{minutes} min</td>
                        <td className={tc.td}>
                          <a href={`/pharmacist/orders/${row.id}`} onClick={(e) => e.preventDefault()} className="font-mono text-pine hover:underline">{row.number}</a>
                        </td>
                        <td className={tc.td}>
                          {row.patient.fullName}
                          {row.ageYears && <span className="text-ink-3"> · {row.ageYears}</span>}
                        </td>
                        <td className={`${tc.td} hidden lg:table-cell`}>{row.reupload ? 'Re-uploaded' : row.source === 'REFILL' ? 'Refill' : 'New'}</td>
                        <td className={tc.td}>
                          <span className="flex items-center gap-2">{row.itemsSummary}{row.hasH1 && <ScheduleTag schedule="H1" />}</span>
                        </td>
                        <td className={tc.td}>{row.aiStatus ? <Pill tone={AI_LABEL[row.aiStatus]!.tone} size="staff">{AI_LABEL[row.aiStatus]!.label}</Pill> : '—'}</td>
                        <td className={`${tc.td} hidden text-ink-2 lg:table-cell`}>{row.reviewingBy ?? '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </StaffLayout>
  );
}
