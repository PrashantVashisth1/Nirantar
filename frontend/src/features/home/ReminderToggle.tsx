import type { RefillDto } from '@nirantar/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';

/** Per-medicine reminder choice (plan C2). Updates at once and undoes itself if saving fails. */
export function ReminderToggle({ refill }: { refill: RefillDto }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: (remindersEnabled: boolean) => api.patch(`/refills/${refill.id}`, { remindersEnabled }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['home'] }),
  });
  const checked = save.isPending ? save.variables : refill.remindersEnabled;

  return (
    <div>
      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-body text-ink-2">
        <input
          type="checkbox"
          className="size-5 shrink-0 accent-pine"
          checked={checked}
          onChange={(e) => save.mutate(e.target.checked)}
        />
        {t('home.remindMe')}
      </label>
      {save.isError && (
        <p role="alert" className="text-caption text-danger">
          {t('common.genericError')}
        </p>
      )}
    </div>
  );
}
