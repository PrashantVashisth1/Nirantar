import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { OrderSummaryDto } from '@nirantar/shared';
import { Download, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { Banner } from '../../design-system/Banner';
import { Pill } from '../../design-system/Badge';
import { Button } from '../../design-system/Button';
import { ErrorState, Skeleton } from '../../design-system/States';
import i18n from '../../i18n';
import { tableClasses as tc } from '../../layouts/StaffLayout';
import { api } from '../../lib/api';
import { errorMessage } from '../../lib/errors';
import { formatDateTime } from '../../lib/format';

interface ImportDto {
  id: string;
  fileName: string;
  status: 'PREVIEW' | 'APPLIED' | 'DISCARDED';
  errorCount: number;
  createdAt: string;
  appliedAt: string | null;
  uploadedBy: string | null;
  summary: {
    rowCount: number;
    validCount: number;
    errorCount: number;
    errors: { row: number; column: string; value: string; message: string }[];
    stores: {
      code: string;
      name: string;
      skus: number;
      setToZero: number;
      belowReserved: number;
    }[];
  };
}

interface StockRow {
  storeCode: string;
  storeName: string;
  sku: string;
  product: string;
  brand: string;
  onHand: number;
  reserved: number;
  available: number;
  countedAt: string | null;
}

const MAX_BYTES = 2_000_000;
const t = i18n.t.bind(i18n);

export function StockTab() {
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<ImportDto | null>(null);
  const [fileError, setFileError] = useState<string>();
  const [applied, setApplied] = useState<string>();

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['ops'] });
  };

  const upload = useMutation({
    mutationFn: (file: { fileName: string; content: string }) =>
      api.post<ImportDto>('/ops/stock-imports', file),
    onSuccess: (result) => {
      setPreview(result);
      setApplied(undefined);
      refresh();
    },
  });
  const apply = useMutation({
    mutationFn: (id: string) =>
      api.post<{ routedOrders: number }>(`/ops/stock-imports/${id}/apply`),
    onSuccess: (result) => {
      setPreview(null);
      setApplied(
        `Import applied.${result.routedOrders > 0 ? ` ${result.routedOrders} waiting order${result.routedOrders === 1 ? ' was' : 's were'} routed.` : ''}`,
      );
      refresh();
    },
  });
  const discard = useMutation({
    mutationFn: (id: string) => api.post<void>(`/ops/stock-imports/${id}/discard`),
    onSuccess: () => {
      setPreview(null);
      refresh();
    },
  });

  async function onFile(file: File | undefined) {
    if (!file) return;
    setFileError(undefined);
    if (file.size > MAX_BYTES) {
      setFileError('The file must be smaller than 2 MB.');
      return;
    }
    upload.mutate({ fileName: file.name, content: await file.text() });
    if (fileInput.current) fileInput.current.value = '';
  }

  return (
    <div className="flex flex-col gap-10">
      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-staff-section font-semibold text-ink">Daily stock count</h2>
            <p className="mt-1 max-w-2xl text-staff-body text-ink-2">
              Upload this morning's shelf count as CSV (
              <span className="font-mono">store_code,sku,on_hand</span>). You'll see a preview
              first; nothing changes until you apply it, and a file with any error can't be applied.
            </p>
          </div>
          <div className="flex gap-2">
            <a
              href="/api/ops/stock-template.csv"
              className="inline-flex h-9 items-center gap-2 rounded-sm border border-line-strong bg-surface px-3.5 text-staff-body font-medium text-ink hover:bg-sunken"
            >
              <Download className="size-4" aria-hidden /> Template
            </a>
            <input
              ref={fileInput}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              id="stock-file"
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
            <Button
              size="md"
              icon={<Upload className="size-4" aria-hidden />}
              loading={upload.isPending}
              onClick={() => fileInput.current?.click()}
            >
              Upload stock CSV
            </Button>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3" aria-live="polite">
          {fileError && <Banner tone="danger" title={fileError} />}
          {upload.error && <Banner tone="danger" title={errorMessage(upload.error, t)} />}
          {apply.error && <Banner tone="danger" title={errorMessage(apply.error, t)} />}
          {applied && <Banner tone="success" title={applied} />}
        </div>

        {preview && (
          <ImportPreview
            preview={preview}
            applying={apply.isPending}
            discarding={discard.isPending}
            onApply={() => apply.mutate(preview.id)}
            onDiscard={() => discard.mutate(preview.id)}
          />
        )}
      </section>

      <WaitingOrders />
      <CurrentStock />
      <ImportHistory />
    </div>
  );
}

function ImportPreview({
  preview,
  applying,
  discarding,
  onApply,
  onDiscard,
}: {
  preview: ImportDto;
  applying: boolean;
  discarding: boolean;
  onApply: () => void;
  onDiscard: () => void;
}) {
  const { summary } = preview;
  const hasErrors = summary.errorCount > 0;
  return (
    <div className="mt-5 rounded-md border border-line bg-surface p-4 shadow-raised sm:p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-staff-section font-semibold text-ink">Preview: {preview.fileName}</h3>
        <Pill tone={hasErrors ? 'danger' : 'success'} size="staff">
          {hasErrors
            ? `${summary.errorCount} error${summary.errorCount === 1 ? '' : 's'}`
            : 'Ready to apply'}
        </Pill>
      </div>
      <p className="mt-1 text-staff-body text-ink-2 tabular-nums">
        {summary.rowCount} rows · {summary.validCount} valid · {summary.errorCount} with errors
      </p>

      {summary.stores.length > 0 && (
        <div className={`mt-4 ${tc.wrap}`}>
          <table className={tc.table}>
            <thead className={tc.head}>
              <tr>
                <th className={tc.th}>Store</th>
                <th className={`${tc.th} text-right`}>SKUs in file</th>
                <th className={`${tc.th} text-right`}>Set to 0 (missing from file)</th>
                <th className={`${tc.th} text-right`}>Below reserved</th>
              </tr>
            </thead>
            <tbody>
              {summary.stores.map((s) => (
                <tr key={s.code} className={tc.row}>
                  <td className={tc.td}>
                    <span className="font-mono text-ink-2">{s.code}</span> {s.name}
                  </td>
                  <td className={`${tc.td} text-right tabular-nums`}>{s.skus}</td>
                  <td className={`${tc.td} text-right tabular-nums`}>{s.setToZero}</td>
                  <td
                    className={cn(
                      tc.td,
                      'text-right tabular-nums',
                      s.belowReserved > 0 && 'font-semibold text-warning',
                    )}
                  >
                    {s.belowReserved}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {hasErrors && (
        <>
          <h4 className="mt-5 text-staff-body font-semibold text-ink">Rows to fix</h4>
          <div className={`mt-2 max-h-72 overflow-y-auto ${tc.wrap}`}>
            <table className={tc.table}>
              <thead className={`${tc.head} sticky top-0`}>
                <tr>
                  <th className={tc.th}>Row</th>
                  <th className={tc.th}>Column</th>
                  <th className={tc.th}>Value</th>
                  <th className={tc.th}>Problem</th>
                </tr>
              </thead>
              <tbody>
                {summary.errors.map((e, i) => (
                  <tr key={i} className={tc.row}>
                    <td className={`${tc.td} tabular-nums`}>{e.row}</td>
                    <td className={`${tc.td} font-mono`}>{e.column}</td>
                    <td className={`${tc.td} font-mono`}>{e.value || '(empty)'}</td>
                    <td className={`${tc.td} text-danger`}>{e.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
        {hasErrors && (
          <p className="mr-auto text-staff-table text-ink-2">
            Fix these rows and upload the file again. Nothing has been changed.
          </p>
        )}
        <Button variant="secondary" size="md" loading={discarding} onClick={onDiscard}>
          Discard
        </Button>
        <Button size="md" disabled={hasErrors} loading={applying} onClick={onApply}>
          Apply import
        </Button>
      </div>
    </div>
  );
}

export function WaitingOrders() {
  const queryClient = useQueryClient();
  const waiting = useQuery({
    queryKey: ['ops', 'awaiting-stock'],
    queryFn: () =>
      api.get<(OrderSummaryDto & { routingNote: string | null })[]>('/ops/awaiting-stock'),
  });
  const retry = useMutation({
    mutationFn: (id: string) => api.post<{ outcome: string }>(`/ops/orders/${id}/retry-routing`),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['ops'] }),
  });

  if (!waiting.data || waiting.data.length === 0) return null;
  return (
    <section>
      <h2 className="text-staff-section font-semibold text-ink">
        Waiting for stock ({waiting.data.length})
      </h2>
      <p className="mt-1 text-staff-body text-ink-2">
        Approved orders no store within range can fill yet. They're retried after every import.
      </p>
      <ul className="mt-3 divide-y divide-line border-y border-line bg-surface">
        {waiting.data.map((order) => (
          <li
            key={order.id}
            className="flex flex-wrap items-center gap-3 px-4 py-3 text-staff-table"
          >
            <span className="font-mono">{order.number}</span>
            <span className="text-ink">{order.itemsSummary}</span>
            <span className="w-full text-ink-2 sm:w-auto sm:flex-1">{order.routingNote}</span>
            <Button
              variant="secondary"
              size="sm"
              loading={retry.isPending && retry.variables === order.id}
              onClick={() => retry.mutate(order.id)}
            >
              Retry routing
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CurrentStock() {
  const [storeId, setStoreId] = useState('');
  const [query, setQuery] = useState('');
  const stores = useQuery({
    queryKey: ['ops', 'stores'],
    queryFn: () => api.get<{ id: string; code: string; name: string }[]>('/ops/stores'),
  });
  const stock = useQuery({
    queryKey: ['ops', 'stock', storeId, query],
    queryFn: () =>
      api.get<StockRow[]>(
        `/ops/stock?${new URLSearchParams({ ...(storeId ? { storeId } : {}), ...(query ? { q: query } : {}) })}`,
      ),
  });

  return (
    <section>
      <h2 className="text-staff-section font-semibold text-ink">Current stock</h2>
      <p className="mt-1 text-staff-body text-ink-2">
        Available = on hand − reserved for routed orders. Prototype data: 6 synthetic stores (the
        chain has 46).
      </p>
      <div className="mt-3 flex flex-wrap gap-3">
        <select
          aria-label="Store"
          value={storeId}
          onChange={(e) => setStoreId(e.target.value)}
          className="h-9 rounded-sm border border-line-strong bg-surface px-3 text-staff-body"
        >
          <option value="">All stores</option>
          {stores.data?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.code} · {s.name}
            </option>
          ))}
        </select>
        <input
          aria-label="Search product"
          placeholder="Search medicine or SKU"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-9 w-64 max-w-full rounded-sm border border-line-strong bg-surface px-3 text-staff-body placeholder:text-ink-3"
        />
      </div>
      {stock.isLoading && <Skeleton className="mt-3 h-48 w-full" />}
      {stock.isError && (
        <div className="mt-3">
          <ErrorState message={errorMessage(stock.error, t)} onRetry={() => void stock.refetch()} />
        </div>
      )}
      {stock.data && stock.data.length === 0 && (
        <p className="mt-4 text-staff-body text-ink-2">
          No stock rows match. Upload today's CSV to start routing.
        </p>
      )}
      {stock.data && stock.data.length > 0 && (
        <div className={`mt-3 max-h-[480px] overflow-y-auto ${tc.wrap}`}>
          <table className={tc.table}>
            <thead className={`${tc.head} sticky top-0`}>
              <tr>
                <th className={tc.th}>Store</th>
                <th className={tc.th}>Medicine</th>
                <th className={`${tc.th} text-right`}>On hand</th>
                <th className={`${tc.th} text-right`}>Reserved</th>
                <th className={`${tc.th} text-right`}>Available</th>
                <th className={tc.th}>Counted</th>
              </tr>
            </thead>
            <tbody>
              {stock.data.map((row) => {
                const stale =
                  !row.countedAt || Date.now() - new Date(row.countedAt).getTime() > 48 * 3600_000;
                return (
                  <tr key={`${row.storeCode}:${row.sku}`} className={tc.row}>
                    <td className={`${tc.td} font-mono text-ink-2`}>{row.storeCode}</td>
                    <td className={tc.td}>
                      {row.product} <span className="text-ink-3">· {row.brand}</span>
                    </td>
                    <td className={`${tc.td} text-right tabular-nums`}>{row.onHand}</td>
                    <td className={`${tc.td} text-right tabular-nums`}>{row.reserved}</td>
                    <td
                      className={cn(
                        tc.td,
                        'text-right font-semibold tabular-nums',
                        row.available <= 0 ? 'text-danger' : 'text-ink',
                      )}
                    >
                      {row.available}
                    </td>
                    <td className={cn(tc.td, stale ? 'text-warning' : 'text-ink-2')}>
                      {row.countedAt ? formatDateTime(row.countedAt, 'en') : 'Never'}
                      {stale && ' · stale, not used for routing'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ImportHistory() {
  const history = useQuery({
    queryKey: ['ops', 'imports'],
    queryFn: () => api.get<ImportDto[]>('/ops/stock-imports'),
  });
  if (!history.data || history.data.length === 0) return null;
  return (
    <section>
      <h2 className="text-staff-section font-semibold text-ink">Import history</h2>
      <div className={`mt-3 ${tc.wrap}`}>
        <table className={tc.table}>
          <thead className={tc.head}>
            <tr>
              <th className={tc.th}>Uploaded</th>
              <th className={tc.th}>File</th>
              <th className={`${tc.th} text-right`}>Rows</th>
              <th className={tc.th}>Result</th>
              <th className={tc.th}>By</th>
            </tr>
          </thead>
          <tbody>
            {history.data.map((item) => (
              <tr key={item.id} className={tc.row}>
                <td className={tc.td}>{formatDateTime(item.createdAt, 'en')}</td>
                <td className={`${tc.td} font-mono`}>{item.fileName}</td>
                <td className={`${tc.td} text-right tabular-nums`}>{item.summary.rowCount}</td>
                <td className={tc.td}>
                  <Pill
                    tone={
                      item.status === 'APPLIED'
                        ? 'success'
                        : item.status === 'DISCARDED'
                          ? 'neutral'
                          : item.errorCount > 0
                            ? 'danger'
                            : 'info'
                    }
                    size="staff"
                  >
                    {item.status === 'PREVIEW'
                      ? item.errorCount > 0
                        ? `${item.errorCount} errors`
                        : 'Not applied'
                      : item.status === 'APPLIED'
                        ? 'Applied'
                        : 'Discarded'}
                  </Pill>
                </td>
                <td className={`${tc.td} text-ink-2`}>{item.uploadedBy}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function cn(...values: (string | false | undefined)[]) {
  return values.filter(Boolean).join(' ');
}
