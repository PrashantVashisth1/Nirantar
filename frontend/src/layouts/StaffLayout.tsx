import { LogOut } from 'lucide-react';
import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router';
import { Button } from '../design-system/Button';
import { useAppConfig } from '../lib/config';
import { useMe, useSignOut } from '../lib/session';
import { DemoGuide } from './DemoGuide';

/** Staff workbench frame (English only, denser type, full width up to 1440 px). */
export function StaffLayout({ children }: { children: ReactNode }) {
  const { data: me } = useMe();
  const { data: config } = useAppConfig();
  const signOut = useSignOut();
  const navigate = useNavigate();

  return (
    <div lang="en" className="min-h-dvh bg-canvas">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex min-h-14 max-w-[1440px] flex-wrap items-center gap-x-3 px-4 py-1.5 sm:flex-nowrap sm:py-0 sm:px-6">
          <span className="text-staff-section font-semibold text-pine">Nirantar</span>
          <span className="hidden text-staff-table text-ink-3 sm:inline">
            {me?.role === 'PHARMACIST' ? 'Pharmacist' : 'Central operations'}
          </span>
          {config?.testMode && (
            <span className="whitespace-nowrap rounded-full bg-warning-bg px-2 py-0.5 text-staff-caption font-medium text-warning">
              Test mode
            </span>
          )}
          {me?.role === 'PHARMACIST' && (
            <nav aria-label="Pharmacist" className="order-last flex w-full gap-1 sm:order-none sm:ml-2 sm:w-auto">
              {[
                { to: '/pharmacist', label: 'Queue', end: true },
                { to: '/pharmacist/store', label: 'Store orders', end: false },
              ].map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={link.end}
                  className={({ isActive }) =>
                    `flex h-9 items-center whitespace-nowrap rounded-sm px-3 text-staff-body font-medium ${isActive ? 'bg-pine-subtle text-pine' : 'text-ink-2 hover:bg-sunken'}`
                  }
                >
                  {link.label}
                </NavLink>
              ))}
            </nav>
          )}
          <div className="ml-auto flex items-center gap-3">
            {me && (
              <span className="hidden text-staff-table text-ink-2 md:inline">
                {me.name}
                {me.pharmacistRegNo && <span className="text-ink-3"> · {me.pharmacistRegNo}</span>}
                {me.store && <span className="text-ink-3"> · {me.store.name}</span>}
              </span>
            )}
            <Button
              variant="quiet"
              size="sm"
              icon={<LogOut className="size-4" aria-hidden />}
              loading={signOut.isPending}
              onClick={() =>
                signOut.mutate(undefined, {
                  onSuccess: () => navigate('/signin', { replace: true }),
                })
              }
            >
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 sm:py-8">
        <DemoGuide className="mb-5" />
        {children}
      </main>
    </div>
  );
}

/** Staff tables: hairlines, sunken header, horizontal scroll inside the panel on small screens. */
export const tableClasses = {
  wrap: 'overflow-x-auto border-y border-line bg-surface',
  table: 'w-full text-left text-staff-table',
  head: 'bg-sunken text-staff-caption text-ink-2',
  th: 'whitespace-nowrap px-4 py-2.5 font-medium',
  td: 'whitespace-nowrap px-4 py-2.5',
  row: 'border-t border-line',
};
