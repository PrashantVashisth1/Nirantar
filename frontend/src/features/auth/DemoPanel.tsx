import type { DemoAccountDto, MeDto } from '@nirantar/shared';
import { useMutation } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Banner } from '../../design-system/Banner';
import { Spinner } from '../../design-system/Spinner';
import { api } from '../../lib/api';
import { useAppConfig } from '../../lib/config';
import { errorMessage } from '../../lib/errors';

const GROUPS: { group: DemoAccountDto['group']; title: string; note: string }[] = [
  { group: 'CUSTOMER', title: 'Customers', note: 'Order medicines and track them.' },
  { group: 'PHARMACIST', title: 'Pharmacists', note: 'Check every medicine, then dispatch from their store.' },
  { group: 'OPS', title: 'Central operations', note: 'One view of all stores.' },
];

/**
 * Test mode only: become anyone with one tap, so a reviewer doesn't have to
 * look up numbers. The list comes from the server, which sends nothing outside
 * test mode. Written for reviewers, so it stays in English in every language.
 */
export function DemoPanel({ onSignedIn }: { onSignedIn: (user: MeDto) => void }) {
  const { t } = useTranslation();
  const { data: config } = useAppConfig();
  const signIn = useMutation({
    mutationFn: (key: string) => api.post<{ user: MeDto }>('/auth/demo-login', { key }),
    onSuccess: ({ user }) => onSignedIn(user),
  });

  const accounts = config?.demoAccounts;
  if (!accounts?.length) return null;

  return (
    <section lang="en" aria-labelledby="demo-title" className="mt-8 rounded-md border border-line bg-surface p-4 sm:p-5">
      <h2 id="demo-title" className="text-heading font-semibold text-ink">
        Try the demo
      </h2>
      <p className="mt-1 text-body text-ink-2">
        Tap anyone to continue as them; each one tells you what to try. All data is fictional.
      </p>
      <p className="mt-2 text-caption text-ink-3">
        Suggested path: Debasish reorders → Sanjukta approves and dispatches → Sudipta uploads a prescription → Priya sees
        it all.
      </p>
      {signIn.error && <Banner tone="danger" className="mt-3" title={errorMessage(signIn.error, t)} />}

      {GROUPS.map(({ group, title, note }) => (
        <div key={group} className="mt-5">
          <h3 className="text-body font-semibold text-ink">{title}</h3>
          <p className="text-caption text-ink-3">{note}</p>
          <ul className="mt-1 divide-y divide-line border-y border-line">
            {accounts
              .filter((account) => account.group === group)
              .map((account) => (
                <li key={account.key}>
                  <button
                    type="button"
                    disabled={signIn.isPending}
                    onClick={() => signIn.mutate(account.key)}
                    className="flex min-h-14 w-full items-center gap-3 py-2 text-left hover:bg-canvas disabled:opacity-60"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-body font-medium text-ink">{account.name}</span>
                      <span className="block text-caption text-ink-2">{account.headline}</span>
                    </span>
                    {signIn.isPending && signIn.variables === account.key ? (
                      <Spinner className="size-5 text-pine" />
                    ) : (
                      <ChevronRight className="size-5 shrink-0 text-ink-3" aria-hidden />
                    )}
                  </button>
                </li>
              ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
