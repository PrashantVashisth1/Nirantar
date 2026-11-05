import { useQuery } from '@tanstack/react-query';
import { Banner } from '../../design-system/Banner';
import { EmptyState, ErrorState, Skeleton } from '../../design-system/States';
import i18n from '../../i18n';
import { tableClasses as tc } from '../../layouts/StaffLayout';
import { api } from '../../lib/api';
import { errorMessage } from '../../lib/errors';
import { formatDateTime } from '../../lib/format';

interface Rule {
  schedule: string;
  label: string;
  rxRequired: boolean;
  registerRequired: boolean;
}

interface RegisterEntry {
  id: string;
  suppliedAt: string;
  orderNumber: string;
  product: string;
  quantity: number;
  patientName: string;
  patientAddress: string;
  prescriberName: string;
  prescriberRegNo: string;
  pharmacist: string;
  pharmacistRegNo: string | null;
  store: string;
}

/** O1 Rules: the configurable schedule rules and the H1 register, read-only (plan O1). */
export function RulesTab() {
  const rules = useQuery({ queryKey: ['ops', 'rules'], queryFn: () => api.get<Rule[]>('/ops/rules') });
  const register = useQuery({
    queryKey: ['ops', 'h1-register'],
    queryFn: () => api.get<RegisterEntry[]>('/ops/h1-register'),
  });

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="text-staff-section font-semibold text-ink">Schedule rules</h2>
        <p className="mt-1 max-w-2xl text-staff-body text-ink-2">
          Stored as data, so they can change without a code release. Classifications are illustrative for this demo.
        </p>
        {rules.isPending && <Skeleton className="mt-3 h-40" />}
        {rules.isError && <ErrorState message={errorMessage(rules.error, i18n.t.bind(i18n))} onRetry={() => void rules.refetch()} />}
        {rules.data && (
          <div className={`mt-3 ${tc.wrap}`}>
            <table className={tc.table}>
              <thead className={tc.head}>
                <tr>
                  <th className={tc.th}>Schedule</th>
                  <th className={tc.th}>Rule</th>
                  <th className={tc.th}>Prescription</th>
                  <th className={tc.th}>H1 register</th>
                </tr>
              </thead>
              <tbody>
                {rules.data.map((rule) => (
                  <tr key={rule.schedule} className={tc.row}>
                    <td className={`${tc.td} font-medium`}>{rule.schedule}</td>
                    <td className={tc.td}>{rule.label}</td>
                    <td className={tc.td}>{rule.rxRequired ? 'Required' : 'Not required'}</td>
                    <td className={tc.td}>{rule.registerRequired ? 'Required at sale' : 'Not required'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-3">
          <Banner tone="info">
            Schedule X and narcotic (NDPS) items are never sold online. That ban is fixed in code and in the database,
            so it isn't a rule anyone can change here.
          </Banner>
        </div>
      </section>

      <section>
        <h2 className="text-staff-section font-semibold text-ink">H1 register</h2>
        <p className="mt-1 max-w-2xl text-staff-body text-ink-2">
          One row per H1 item, written in the same transaction as the handover. Latest 100 entries.
        </p>
        {register.isPending && <Skeleton className="mt-3 h-40" />}
        {register.isError && (
          <ErrorState message={errorMessage(register.error, i18n.t.bind(i18n))} onRetry={() => void register.refetch()} />
        )}
        {register.data?.length === 0 && <EmptyState title="No H1 items have been supplied yet." />}
        {register.data && register.data.length > 0 && (
          <div className={`mt-3 ${tc.wrap}`}>
            <table className={tc.table}>
              <thead className={tc.head}>
                <tr>
                  <th className={tc.th}>Supplied</th>
                  <th className={tc.th}>Order</th>
                  <th className={tc.th}>Medicine</th>
                  <th className={`${tc.th} text-right`}>Qty</th>
                  <th className={tc.th}>Patient</th>
                  <th className={tc.th}>Address</th>
                  <th className={tc.th}>Prescriber</th>
                  <th className={tc.th}>Pharmacist</th>
                  <th className={tc.th}>Store</th>
                </tr>
              </thead>
              <tbody>
                {register.data.map((entry) => (
                  <tr key={entry.id} className={tc.row}>
                    <td className={tc.td}>{formatDateTime(entry.suppliedAt, i18n.language)}</td>
                    <td className={tc.td}>{entry.orderNumber}</td>
                    <td className={tc.td}>{entry.product}</td>
                    <td className={`${tc.td} text-right tabular-nums`}>{entry.quantity}</td>
                    <td className={tc.td}>{entry.patientName}</td>
                    <td className={tc.td}>{entry.patientAddress}</td>
                    <td className={tc.td}>
                      {entry.prescriberName} · {entry.prescriberRegNo}
                    </td>
                    <td className={tc.td}>
                      {entry.pharmacist} · {entry.pharmacistRegNo}
                    </td>
                    <td className={tc.td}>{entry.store}</td>
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
