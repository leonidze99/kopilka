import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { server } from './server';

// Pages are lazy chunks (routes.tsx): the first findBy… of a test file
// waits for Vite to transform the page in that worker, which with every
// worker busy took longer than the default 1 s, and a random first test
// failed. Waiting only costs time while the element is not there yet.
configure({ asyncUtilTimeout: 5000 });

// jsdom brings its own FormData and File, but fetch here is Node's
// (undici), which cannot read them: an upload fails with "reading
// '_buffer'". Browsers have one implementation of both. Node's classes are
// not globals under jsdom; a multipart body parsed by Node's Response
// gives an instance of each.
const nodeForm = await new Response(
  '--b\r\nContent-Disposition: form-data; name="f"; filename="f"\r\n\r\n\r\n--b--\r\n',
  { headers: { 'content-type': 'multipart/form-data; boundary=b' } },
).formData();
globalThis.FormData = nodeForm.constructor as typeof FormData;
globalThis.File = (nodeForm.get('f') as File).constructor as typeof File;

// jsdom has <dialog> but not its methods. The attribute is enough for tests:
// an open dialog is in the accessibility tree, a closed one is not.
HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
  this.open = true;
};
HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
  if (!this.open) return;
  this.open = false;
  this.dispatchEvent(new Event('close'));
};

// jsdom has no object URLs; receipt photos are shown through them.
if (!('createObjectURL' in URL)) {
  Object.assign(URL, {
    createObjectURL: () => `blob:test/${crypto.randomUUID()}`,
    revokeObjectURL: () => {},
  });
}

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
