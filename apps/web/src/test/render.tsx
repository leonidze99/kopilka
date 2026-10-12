import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { routes } from '@/app/router/routes';
import { useRestoreSession } from '@/app/session/useRestoreSession';
import { makeStore } from '@/app/store/store';
import type { SessionState } from '@/entities/session';
import { authResponse } from './api';

function RestoreSession() {
  useRestoreSession();
  return null;
}

interface RenderAppOptions {
  /** Default: anonymous. `unknown` runs the real session restore on mount. */
  session?: SessionState['status'];
}

/** The real app (store, routes, guards) at `path`, in memory. */
export function renderApp(
  path: string,
  { session = 'anonymous' }: RenderAppOptions = {},
) {
  const { accessToken, user: profile } = authResponse();
  const store = makeStore({
    session:
      session === 'authenticated'
        ? { status: 'authenticated', accessToken, user: profile }
        : { status: session, accessToken: null, user: null },
  });
  const router = createMemoryRouter(routes, { initialEntries: [path] });

  render(
    <Provider store={store}>
      {session === 'unknown' && <RestoreSession />}
      <RouterProvider router={router} />
    </Provider>,
  );
  return { store, router, user: userEvent.setup() };
}

/**
 * Waits until the signed-in start page has finished loading. Returning on
 * the heading alone would let its requests (summary, list) land in the
 * next test, after its handlers are gone.
 */
export async function expectOperationsPage() {
  await screen.findByRole('heading', { level: 1, name: 'Операции' });
  await screen.findByText('Операций пока нет');
  await screen.findByText('За год операций нет');
  // Income, expense and balance, once the summary has arrived.
  const summary = screen.getByRole('region', { name: /^Итоги/ });
  expect(await within(summary).findAllByText(/^0,00/)).toHaveLength(3);
}
