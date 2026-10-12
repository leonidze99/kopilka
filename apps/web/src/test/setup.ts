import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { server } from './server';

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
