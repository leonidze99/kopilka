import { combineSlices, configureStore } from '@reduxjs/toolkit';
import { sessionSlice } from '@/entities/session';
import { baseApi } from '@/shared/api';

const rootReducer = combineSlices(baseApi, sessionSlice);

export type RootState = ReturnType<typeof rootReducer>;

/** A factory, not a singleton: every test gets a clean store. */
export function makeStore(preloadedState?: Partial<RootState>) {
  return configureStore({
    reducer: rootReducer,
    preloadedState,
    middleware: (getDefault) => getDefault().concat(baseApi.middleware),
  });
}

export type AppStore = ReturnType<typeof makeStore>;
export type AppDispatch = AppStore['dispatch'];
