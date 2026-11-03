import type { Role } from '@nirantar/shared';
import type { ReactNode } from 'react';
import { Navigate } from 'react-router';
import { Skeleton } from '../design-system/States';
import { homePathFor, useMe } from '../lib/session';

/**
 * Shows the page only to the given roles. The server enforces the same rules;
 * this just sends people to the right place instead of a broken screen.
 */
export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { data: me, isLoading } = useMe();
  if (isLoading) {
    return (
      <div className="mx-auto max-w-[560px] px-4 pt-20">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="mt-6 h-40 w-full" />
      </div>
    );
  }
  if (!me) return <Navigate to="/signin" replace />;
  if (!roles.includes(me.role)) return <Navigate to={homePathFor(me)} replace />;
  return <>{children}</>;
}

/** "/" sends each person to their own starting screen. */
export function RootRedirect() {
  const { data: me, isLoading } = useMe();
  if (isLoading) return null;
  return <Navigate to={me ? homePathFor(me) : '/signin'} replace />;
}
