import { X } from 'lucide-react';
import { Dialog } from 'radix-ui';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../lib/cn';

/**
 * A bottom sheet on phones that becomes a centred dialog on wider screens.
 * Radix provides the accessibility (focus trap, Escape to close, screen-reader
 * labelling); the look is ours.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/40 animate-fade-in" />
        <Dialog.Content
          className={cn(
            'fixed inset-x-0 bottom-0 z-50 max-h-[90dvh] overflow-y-auto bg-surface shadow-overlay animate-sheet-up',
            'rounded-t-lg px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5',
            'sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[min(480px,calc(100vw-48px))]',
            'sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-md sm:px-6 sm:pb-6',
          )}
          {...(description ? {} : { 'aria-describedby': undefined })}
        >
          <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line sm:hidden" aria-hidden />
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="font-serif text-heading font-semibold text-ink">
                {title}
              </Dialog.Title>
              {description && (
                <Dialog.Description className="mt-1 text-body text-ink-2">
                  {description}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close
              className="-mr-2 -mt-1 grid size-11 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-sunken"
              aria-label={t('common.close')}
            >
              <X className="size-5" aria-hidden />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
