import { useMutation, useQueryClient } from '@tanstack/react-query';
import { RotateCcw } from 'lucide-react';
import { Tabs } from 'radix-ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { Banner } from '../../design-system/Banner';
import { Button } from '../../design-system/Button';
import { Sheet } from '../../design-system/Sheet';
import { StaffLayout } from '../../layouts/StaffLayout';
import { api } from '../../lib/api';
import { cn } from '../../lib/cn';
import { useAppConfig } from '../../lib/config';
import { errorMessage } from '../../lib/errors';
import { OverviewTab } from './OverviewTab';
import { RemindersTab } from './RemindersTab';
import { RulesTab } from './RulesTab';
import { StockTab } from './StockTab';

const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'stock', label: 'Stock' },
  { value: 'reminders', label: 'Reminders' },
  { value: 'rules', label: 'Rules' },
] as const;

/** O1: central operations. */
export function OperationsPage() {
  const [tab, setTab] = useState<string>('overview');
  const { data: config } = useAppConfig();
  return (
    <StaffLayout>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-staff-title font-semibold text-ink">Operations</h1>
        {config?.testMode && <ResetDemo />}
      </div>
      <Tabs.Root value={tab} onValueChange={setTab} className="mt-4">
        <Tabs.List className="flex gap-1 overflow-x-auto border-b border-line" aria-label="Operations sections">
          {TABS.map((t) => (
            <Tabs.Trigger
              key={t.value}
              value={t.value}
              className={cn(
                '-mb-px h-10 border-b-2 px-3 text-staff-body font-medium transition-colors duration-120',
                tab === t.value ? 'border-pine text-ink' : 'border-transparent text-ink-2 hover:text-ink',
              )}
            >
              {t.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        <Tabs.Content value="overview" className="pt-6">
          <OverviewTab />
        </Tabs.Content>
        <Tabs.Content value="stock" className="pt-6">
          <StockTab />
        </Tabs.Content>
        <Tabs.Content value="reminders" className="pt-6">
          <RemindersTab />
        </Tabs.Content>
        <Tabs.Content value="rules" className="pt-6">
          <RulesTab />
        </Tabs.Content>
      </Tabs.Root>
    </StaffLayout>
  );
}

/** Test mode only: puts the demo back to its starting state so a reviewer can start over. */
function ResetDemo() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const reset = useMutation({
    mutationFn: () => api.post('/ops/demo/reset'),
    onSuccess: () => {
      queryClient.clear();
      navigate('/signin', { replace: true });
    },
  });
  return (
    <>
      <Button variant="secondary" icon={<RotateCcw className="size-4" aria-hidden />} onClick={() => setOpen(true)}>
        Reset demo
      </Button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Reset the demo?"
        description="All demo orders and accounts go back to their starting state, and everyone is signed out. This takes a few seconds."
      >
        {reset.isError && (
          <div className="mb-4">
            <Banner tone="danger" title={errorMessage(reset.error, t)} />
          </div>
        )}
        <div className="flex flex-col gap-2">
          <Button variant="primary" fullWidth loading={reset.isPending} onClick={() => reset.mutate()}>
            Reset demo
          </Button>
          <Button variant="secondary" fullWidth onClick={() => setOpen(false)}>
            Keep going
          </Button>
        </div>
      </Sheet>
    </>
  );
}
