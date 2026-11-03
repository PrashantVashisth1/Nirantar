import { Languages, LogOut, UserRound } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { Button } from '../design-system/Button';
import { Sheet } from '../design-system/Sheet';
import { LANGUAGE_OPTIONS } from '../i18n';
import { useAppConfig } from '../lib/config';
import { useMe, useSignOut } from '../lib/session';
import { LanguageSheet } from './LanguageSheet';

/**
 * Customer frame: a quiet header and one centred reading column (max 560 px)
 * that is the same on phone, tablet and desktop (plan §3.5). The customer app
 * has one home screen, so there's no tab bar: account actions live in a sheet.
 */
export function CustomerLayout({ children }: { children: ReactNode }) {
  const { t, i18n } = useTranslation();
  const { data: me } = useMe();
  const { data: config } = useAppConfig();
  const signOut = useSignOut();
  const navigate = useNavigate();
  const [languageOpen, setLanguageOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  const currentLanguage = LANGUAGE_OPTIONS.find((option) => option.locale === i18n.language) ?? LANGUAGE_OPTIONS[0]!;

  return (
    <div className="min-h-dvh bg-canvas">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded-sm focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <header className="border-b border-line bg-canvas">
        <div className="mx-auto flex h-14 max-w-[560px] items-center gap-2 px-4 sm:px-6">
          <Link to="/home" className="font-serif text-[1.25rem] font-semibold text-pine">
            Nirantar
          </Link>
          <div className="ml-auto flex items-center gap-1">
            {config?.testMode && (
              <span className="mr-1 rounded-full bg-warning-bg px-2.5 py-1 text-caption font-medium text-warning">
                {t('common.testMode')}
              </span>
            )}
            <button
              type="button"
              onClick={() => setLanguageOpen(true)}
              className="flex h-11 items-center gap-1.5 rounded-full px-3 text-body text-ink-2 hover:bg-sunken"
              aria-label={`${t('common.language')}: ${currentLanguage.label}`}
            >
              <Languages className="size-5" aria-hidden />
              <span lang={currentLanguage.locale}>{currentLanguage.short}</span>
            </button>
            {me && (
              <button
                type="button"
                onClick={() => setAccountOpen(true)}
                className="grid size-11 place-items-center rounded-full text-ink-2 hover:bg-sunken"
                aria-label={t('account.title')}
              >
                <UserRound className="size-5" aria-hidden />
              </button>
            )}
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-[560px] px-4 pb-16 pt-6 sm:px-6">
        {children}
      </main>

      <LanguageSheet open={languageOpen} onOpenChange={setLanguageOpen} signedIn={Boolean(me)} />

      {me && (
        <Sheet open={accountOpen} onOpenChange={setAccountOpen} title={t('account.title')}>
          <p className="text-body-lg font-medium text-ink">{me.name}</p>
          {me.phoneMasked && (
            <p className="mt-1 text-body text-ink-2">{t('account.signedInAs', { phone: me.phoneMasked })}</p>
          )}
          <Button
            variant="secondary"
            fullWidth
            className="mt-6"
            icon={<LogOut className="size-5" aria-hidden />}
            loading={signOut.isPending}
            onClick={() =>
              signOut.mutate(undefined, {
                onSuccess: () => {
                  setAccountOpen(false);
                  navigate('/signin', { replace: true });
                },
              })
            }
          >
            {t('common.signOut')}
          </Button>
        </Sheet>
      )}
    </div>
  );
}
