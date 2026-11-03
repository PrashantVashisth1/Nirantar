import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellRing } from 'lucide-react';
import { useState } from 'react';
import { Banner } from '../../design-system/Banner';
import { Pill } from '../../design-system/Badge';
import { Button } from '../../design-system/Button';
import { Skeleton } from '../../design-system/States';
import i18n from '../../i18n';
import { tableClasses as tc } from '../../layouts/StaffLayout';
import { api } from '../../lib/api';
import { useAppConfig } from '../../lib/config';
import { errorMessage } from '../../lib/errors';
import { formatDateTime } from '../../lib/format';

interface RunResult {
  asOf: string;
  checked: number;
  sent: number;
  suppressed: number;
  skipped: number;
}

interface ReminderRow {
  id: string;
  createdAt: string;
  status: 'SENT' | 'SKIPPED' | 'SUPPRESSED';
  offsetDays: number;
  reason: string | null;
  patient: string;
  medicine: string;
  runOutOn: string;
  message: string | null;
}

/** Reminders run every day at 09:00 IST on their own; this tab shows them and lets ops run one now. */
export function RemindersTab() {
  const queryClient = useQueryClient();
  const { data: config } = useAppConfig();
  const [asOf, setAsOf] = useState('');
  const recent = useQuery({
    queryKey: ['ops', 'reminders'],
    queryFn: () => api.get<ReminderRow[]>('/ops/reminders'),
  });
  const run = useMutation({
    mutationFn: () => api.post<RunResult>('/ops/reminders/run', asOf ? { asOf } : {}),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['ops', 'reminders'] }),
  });

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="text-staff-section font-semibold text-ink">Refill reminders</h2>
        <p className="mt-1 max-w-2xl text-staff-body text-ink-2">
          Sent automatically every day at 09:00 IST, 5, 2 and 0 days before a medicine runs out,
          based on the dose and quantity a pharmacist confirmed. Running again the same day never
          sends twice; customers with an order already in progress aren't reminded.
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          {config?.testMode && (
            <label className="flex flex-col gap-1 text-staff-table font-medium text-ink">
              As of date (test mode)
              <input
                type="date"
                value={asOf}
                onChange={(e) => setAsOf(e.target.value)}
                className="h-9 rounded-sm border border-line-strong bg-surface px-3 text-staff-body font-normal"
              />
            </label>
          )}
          <Button
            size="md"
            icon={<BellRing className="size-4" aria-hidden />}
            loading={run.isPending}
            onClick={() => run.mutate()}
          >
            Run reminders now
          </Button>
        </div>
        <div className="mt-4" aria-live="polite">
          {run.error && <Banner tone="danger" title={errorMessage(run.error, i18n.t.bind(i18n))} />}
          {run.data && (
            <Banner
              tone="success"
              title={`Run for ${run.data.asOf}: ${run.data.sent} sent, ${run.data.suppressed} held back (order in progress), ${run.data.skipped} skipped.`}
            >
              <span className="text-staff-table text-ink-2">
                {run.data.checked} active refill subscriptions checked.
              </span>
            </Banner>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-staff-section font-semibold text-ink">Recent reminders</h2>
        {recent.isLoading && <Skeleton className="mt-3 h-40 w-full" />}
        {recent.data && recent.data.length === 0 && (
          <p className="mt-3 text-staff-body text-ink-2">
            No reminders yet. Run the job to send today's reminders.
          </p>
        )}
        {recent.data && recent.data.length > 0 && (
          <ul className="mt-3 divide-y divide-line border-y border-line bg-surface md:hidden">
            {recent.data.map((r) => (
              <li key={r.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-staff-body font-medium text-ink">{r.patient}</span>
                  <Pill tone={r.status === 'SENT' ? 'success' : 'neutral'} size="staff">
                    {r.status === 'SENT' ? 'Sent' : 'Held back'}
                  </Pill>
                </div>
                <p className="text-staff-table text-ink-2">
                  {r.medicine} · runs out {r.runOutOn} ·{' '}
                  {r.offsetDays === 0 ? 'run-out day' : `${r.offsetDays} days before`}
                </p>
                <p className="mt-1 text-staff-caption text-ink-3">{r.message ?? r.reason}</p>
              </li>
            ))}
          </ul>
        )}
        {recent.data && recent.data.length > 0 && (
          <div className={`mt-3 hidden md:block ${tc.wrap}`}>
            <table className={tc.table}>
              <thead className={tc.head}>
                <tr>
                  <th className={tc.th}>When</th>
                  <th className={tc.th}>Patient</th>
                  <th className={tc.th}>Medicine</th>
                  <th className={tc.th}>Runs out</th>
                  <th className={tc.th}>Reminder</th>
                  <th className={tc.th}>Result</th>
                </tr>
              </thead>
              <tbody>
                {recent.data.map((r) => (
                  <tr key={r.id} className={`${tc.row} align-top`}>
                    <td className={tc.td}>{formatDateTime(r.createdAt, 'en')}</td>
                    <td className={tc.td}>{r.patient}</td>
                    <td className={tc.td}>{r.medicine}</td>
                    <td className={`${tc.td} tabular-nums`}>{r.runOutOn}</td>
                    <td className={tc.td}>
                      {r.offsetDays === 0 ? 'Run-out day' : `${r.offsetDays} days before`}
                    </td>
                    <td className="px-4 py-2.5">
                      <Pill tone={r.status === 'SENT' ? 'success' : 'neutral'} size="staff">
                        {r.status === 'SENT'
                          ? 'Sent'
                          : r.status === 'SUPPRESSED'
                            ? 'Held back'
                            : 'Skipped'}
                      </Pill>
                      {(r.reason || r.message) && (
                        <p className="mt-1 max-w-md whitespace-normal text-staff-caption text-ink-2">
                          {r.message ?? r.reason}
                        </p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
