import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { server } from './server';

// A request without a handler fails the test: nothing reaches the network
// by accident, and an unexpected call (e.g. a refresh) is caught.
// The 'error' strategy alone only prints and aborts the request; the app
// may handle that failure gracefully and the test would still pass.
const unhandled: string[] = [];

beforeAll(() =>
  server.listen({
    onUnhandledFrame: ({ frame, defaults }) => {
      const { request } = frame.data as { request?: Request };
      unhandled.push(
        request ? `${request.method} ${request.url}` : frame.protocol,
      );
      defaults.error();
    },
  }),
);

afterEach(() => {
  server.resetHandlers();
  cleanup();
  const requests = unhandled.splice(0);
  expect(requests, 'requests without an MSW handler').toEqual([]);
});

afterAll(() => server.close());
