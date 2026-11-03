import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../lib/cn';
import { Button } from './Button';
import { Banner } from './Banner';

/** A placeholder shaped like the content that is loading (no spinners for whole screens). */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-calm-pulse rounded-sm bg-sunken', className)} aria-hidden />;
}

/**
 * Shown while a first request is in flight. After 4 seconds it explains the
 * free-tier server may be waking up, instead of looking broken.
 */
export function LoadingNote() {
  const { t } = useTranslation();
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 4000);
    return () => clearTimeout(timer);
  }, []);
  return (
    <p role="status" className="text-caption text-ink-3">
      {slow ? t('common.connecting') : <span className="sr-only">{t('common.loading')}</span>}
    </p>
  );
}

export function EmptyState({
  illustration,
  title,
  body,
  action,
}: {
  illustration?: ReactNode;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-2 py-10 text-center">
      {illustration && <div className="mb-6">{illustration}</div>}
      <h2 className="font-serif text-title font-semibold text-ink">{title}</h2>
      {body && <div className="mt-3 max-w-sm text-body-lg text-ink-2">{body}</div>}
      {action && <div className="mt-8 w-full max-w-sm">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useTranslation();
  return (
    <Banner
      tone="danger"
      title={message}
      action={
        onRetry && (
          <Button variant="secondary" size="md" onClick={onRetry}>
            {t('common.retry')}
          </Button>
        )
      }
    />
  );
}
