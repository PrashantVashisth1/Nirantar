import type { AppConfigDto } from '@nirantar/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';

/** Public app settings (currently: whether this is a test/demo environment). */
export function useAppConfig() {
  return useQuery({
    queryKey: ['config'],
    queryFn: () => api.get<AppConfigDto>('/config'),
    staleTime: Infinity,
  });
}
