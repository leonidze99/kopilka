import { createSlice } from '@reduxjs/toolkit';
import { type Schemas, sessionEnded, sessionStarted } from '@/shared/api';

export interface SessionState {
  /** `unknown` until the refresh cookie has been tried on page load. */
  status: 'unknown' | 'authenticated' | 'anonymous';
  /** Kept in memory only: unlike localStorage, unreachable for XSS after a reload. */
  accessToken: string | null;
  user: Schemas['User'] | null;
}

const initialState: SessionState = {
  status: 'unknown',
  accessToken: null,
  user: null,
};

export const sessionSlice = createSlice({
  name: 'session',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(sessionStarted, (_state, { payload }) => ({
        status: 'authenticated',
        accessToken: payload.accessToken,
        user: payload.user,
      }))
      .addCase(sessionEnded, () => ({ ...initialState, status: 'anonymous' }));
  },
  selectors: {
    selectSessionStatus: (state) => state.status,
    selectCurrentUser: (state) => state.user,
  },
});

export const { selectSessionStatus, selectCurrentUser } =
  sessionSlice.selectors;
