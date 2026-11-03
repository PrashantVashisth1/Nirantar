import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MeDto } from '@nirantar/shared';
import { api, ApiError } from './api';

export const meQueryKey = ['me'] as const;

/** The signed-in user, or null when nobody is signed in. */
export function useMe() {
  return useQuery({
    queryKey: meQueryKey,
    queryFn: async () => {
      try {
        return await api.get<MeDto>('/me');
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    staleTime: 5 * 60_000,
  });
}

export function useSignOut() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<void>('/auth/logout'),
    onSuccess: () => {
      // Drop every cached response: the next person on this phone must not see them.
      queryClient.clear();
      queryClient.setQueryData(meQueryKey, null);
    },
  });
}

/** Where each role lands after signing in. */
export function homePathFor(user: MeDto): string {
  if (user.role === 'PHARMACIST') return '/pharmacist';
  if (user.role === 'OPS') return '/ops';
  return user.needsOnboarding ? '/welcome' : '/home';
}
