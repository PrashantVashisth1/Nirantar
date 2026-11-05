import type { MessageDto } from '@nirantar/shared';
import { useQuery } from '@tanstack/react-query';
import { MessageSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Banner } from '../design-system/Banner';
import { Sheet } from '../design-system/Sheet';
import { Spinner } from '../design-system/Spinner';
import { api } from '../lib/api';
import { formatDateTime } from '../lib/format';

/**
 * Test mode has no SMS or WhatsApp provider, so every message the system would
 * send is stored and shown here. Refetched each time the sheet opens.
 */
export function TestInboxSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t, i18n } = useTranslation();
  const { data, isPending, isError } = useQuery({
    queryKey: ['messages'],
    queryFn: () => api.get<MessageDto[]>('/messages'),
    enabled: open,
    staleTime: 0,
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={t('inbox.title')} description={t('inbox.note')}>
      {isPending && (
        <div className="grid place-items-center py-8">
          <Spinner />
        </div>
      )}
      {isError && <Banner tone="danger">{t('common.genericError')}</Banner>}
      {data?.length === 0 && (
        <div className="py-8 text-center text-body text-ink-2">
          <MessageSquare className="mx-auto mb-2 size-6" aria-hidden />
          {t('inbox.empty')}
        </div>
      )}
      {data && data.length > 0 && (
        <ul className="divide-y divide-line">
          {data.map((message) => (
            <li key={message.id} className="py-3">
              <p className="text-caption text-ink-2">
                {message.channel} · {formatDateTime(message.createdAt, i18n.language)}
              </p>
              <p className="mt-1 text-body text-ink">{message.body}</p>
              {message.orderId && (
                <Link
                  to={`/orders/${message.orderId}`}
                  onClick={() => onOpenChange(false)}
                  className="mt-1 inline-block min-h-11 py-2.5 text-body font-medium text-pine underline underline-offset-2"
                >
                  {t('inbox.viewOrder')}
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
