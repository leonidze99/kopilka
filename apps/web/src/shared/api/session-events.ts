import { createAction } from '@reduxjs/toolkit';
import type { Schemas } from './types';

/**
 * The API layer reports session changes with these actions and the session
 * entity reduces them. This keeps the FSD import direction: entities depend
 * on shared, never the other way round.
 */
export const sessionStarted =
  createAction<Schemas['AuthResponse']>('session/started');

export const sessionEnded = createAction('session/ended');

/** The slice of state the API layer reads the access token from. */
export interface StateWithAccessToken {
  session: { accessToken: string | null };
}
