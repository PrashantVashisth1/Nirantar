import { Tabs } from 'radix-ui';
import { useState } from 'react';
import { StaffLayout } from '../../layouts/StaffLayout';
import { cn } from '../../lib/cn';
import { RemindersTab } from './RemindersTab';
import { StockTab } from './StockTab';

const TABS = [
  { value: 'stock', label: 'Stock' },
  { value: 'reminders', label: 'Reminders' },
] as const;

/** O1: central operations. The Overview tab (dashboard) is added on Day 6. */
export function OperationsPage() {
  const [tab, setTab] = useState<string>('stock');
  return (
    <StaffLayout>
      <h1 className="text-staff-title font-semibold text-ink">Operations</h1>
      <Tabs.Root value={tab} onValueChange={setTab} className="mt-4">
        <Tabs.List className="flex gap-1 border-b border-line" aria-label="Operations sections">
          {TABS.map((t) => (
            <Tabs.Trigger
              key={t.value}
              value={t.value}
              className={cn(
                '-mb-px h-10 border-b-2 px-3 text-staff-body font-medium transition-colors duration-120',
                tab === t.value
                  ? 'border-pine text-ink'
                  : 'border-transparent text-ink-2 hover:text-ink',
              )}
            >
              {t.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        <Tabs.Content value="stock" className="pt-6">
          <StockTab />
        </Tabs.Content>
        <Tabs.Content value="reminders" className="pt-6">
          <RemindersTab />
        </Tabs.Content>
      </Tabs.Root>
    </StaffLayout>
  );
}
