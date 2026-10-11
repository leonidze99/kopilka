import { useEffect } from 'react';
import { useRestoreSessionMutation } from '@/entities/session';

/**
 * The access token is kept in memory, so a reload starts without one: try
 * the refresh cookie once. StrictMode runs this effect twice in dev; the
 * second call joins the refresh already in flight.
 */
export function useRestoreSession() {
  const [restore] = useRestoreSessionMutation();
  useEffect(() => {
    void restore();
  }, [restore]);
}
