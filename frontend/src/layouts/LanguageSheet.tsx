import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Locale, MeDto } from '@nirantar/shared';
import { useTranslation } from 'react-i18next';
import { RadioCard } from '../design-system/RadioCard';
import { Sheet } from '../design-system/Sheet';
import { LANGUAGE_OPTIONS, setLocale } from '../i18n';
import { api } from '../lib/api';
import { meQueryKey } from '../lib/session';

/** Switches language at once; for signed-in users the choice is also saved to their profile. */
export function LanguageSheet({
  open,
  onOpenChange,
  signedIn,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  signedIn: boolean;
}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: (locale: Locale) => api.patch<MeDto>('/me', { locale }),
    onSuccess: (me) => queryClient.setQueryData(meQueryKey, me),
  });

  function choose(locale: string) {
    setLocale(locale as Locale);
    if (signedIn) save.mutate(locale as Locale);
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={t('common.language')}>
      <div className="flex flex-col gap-3" role="radiogroup" aria-label={t('common.language')}>
        {LANGUAGE_OPTIONS.map((option) => (
          <div key={option.locale} lang={option.locale}>
            <RadioCard
              name="language"
              value={option.locale}
              checked={i18n.language === option.locale}
              onChange={choose}
              title={option.label}
            />
          </div>
        ))}
      </div>
    </Sheet>
  );
}
