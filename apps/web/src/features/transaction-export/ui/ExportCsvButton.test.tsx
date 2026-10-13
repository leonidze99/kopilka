import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { mockAccount } from '@/test/account';
import { apiUrl, FOOD } from '@/test/api';
import { renderApp } from '@/test/render';
import { server } from '@/test/server';

describe('ExportCsvButton', () => {
  const BLOB_URL = 'blob:kopilka/test';
  let clicked: { href: string; download: string }[];
  let revoked: string[];

  /** jsdom has no object URLs and saves no files; watch the attempt. */
  beforeEach(() => {
    clicked = [];
    revoked = [];
    URL.createObjectURL = () => BLOB_URL;
    URL.revokeObjectURL = (value: string) => revoked.push(value);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push({ href: this.href, download: this.download });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('asks for the shown month with the browser time zone and saves the file', async () => {
    mockAccount({ categories: [FOOD] });
    let asked: URL | undefined;
    server.use(
      http.get(apiUrl('/transactions/export'), ({ request }) => {
        asked = new URL(request.url);
        return HttpResponse.text('Дата;Тип\r\n', {
          headers: { 'Content-Type': 'text/csv' },
        });
      }),
    );
    const { user } = renderApp('/?month=2026-10', { session: 'authenticated' });

    await user.click(await screen.findByRole('button', { name: /Экспорт/ }));

    // The period of the month on screen, not everything ever recorded.
    expect(asked?.searchParams.get('from')).toBeTruthy();
    expect(asked?.searchParams.get('to')).toBeTruthy();
    expect(asked?.searchParams.get('timeZone')).toBe(
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    );
    expect(clicked).toEqual([
      { href: BLOB_URL, download: 'kopilka-2026-10.csv' },
    ]);
    // The object URL is let go right after the click.
    expect(revoked).toEqual([BLOB_URL]);
  });

  it('says so when the export fails instead of saving an empty file', async () => {
    mockAccount({ categories: [FOOD] });
    server.use(
      http.get(apiUrl('/transactions/export'), () =>
        HttpResponse.json(
          { code: 'INTERNAL_ERROR', message: 'boom', requestId: 'req-test' },
          { status: 500 },
        ),
      ),
    );
    const { user } = renderApp('/?month=2026-10', { session: 'authenticated' });

    await user.click(await screen.findByRole('button', { name: /Экспорт/ }));

    expect(await screen.findByText(/Код запроса/)).toBeInTheDocument();
    expect(clicked).toHaveLength(0);
  });
});
