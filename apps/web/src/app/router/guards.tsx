import { useSelector } from 'react-redux';
import { Navigate, Outlet, useLocation } from 'react-router';
import { selectSessionStatus } from '@/entities/session';
import { PageLoader } from '@/shared/ui';

interface FromState {
  from?: string;
}

/** Pages for signed-in users; others go to /login and come back after. */
export function RequireAuth() {
  const status = useSelector(selectSessionStatus);
  const location = useLocation();

  if (status === 'unknown') return <PageLoader />;
  if (status === 'anonymous') {
    const from = location.pathname + location.search;
    return (
      <Navigate to="/login" replace state={{ from } satisfies FromState} />
    );
  }
  return <Outlet />;
}

/**
 * Login and sign-up. Once the session starts (form success, or a session
 * restored in another tab), redirect to where the user was going.
 */
export function GuestOnly() {
  const status = useSelector(selectSessionStatus);
  const location = useLocation();

  if (status === 'unknown') return <PageLoader />;
  if (status === 'authenticated') {
    const from = (location.state as FromState | null)?.from ?? '/';
    return <Navigate to={from} replace />;
  }
  return <Outlet />;
}
