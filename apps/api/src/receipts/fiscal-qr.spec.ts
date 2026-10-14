import { parseFiscalQr } from './fiscal-qr.js';

const FISCAL = 'fn=7380440700076549&i=41406&fp=2671185794';

describe('parseFiscalQr', () => {
  it('reads the time, the total and a purchase', () => {
    expect(parseFiscalQr(`t=20261014T1630&s=1000.00&${FISCAL}&n=1`)).toEqual({
      occurredAt: '2026-10-14T16:30',
      amount: '1000.00',
      type: 'expense',
    });
  });

  it.each([
    ['seconds in the time', 't=20261014T163015&s=1000&n=1', '2026-10-14T16:30'],
    [
      'no fraction in the total',
      't=20261014T1630&s=99&n=1',
      '2026-10-14T16:30',
    ],
  ])('takes %s', (_, fields, occurredAt) => {
    const qr = parseFiscalQr(`${fields}&${FISCAL}`);

    expect(qr?.occurredAt).toBe(occurredAt);
    expect(qr?.amount).toMatch(/^\d+\.\d{2}$/);
  });

  it.each([
    ['1', 'expense'],
    ['2', 'income'],
    ['3', 'income'],
    ['4', 'expense'],
  ])('reads operation %s as %s', (n, type) => {
    expect(
      parseFiscalQr(`t=20261014T1630&s=10.50&${FISCAL}&n=${n}`)?.type,
    ).toBe(type);
  });

  it.each([
    ['a link', 'https://example.com/?t=20261014T1630&s=10'],
    ['no fiscal fields', 't=20261014T1630&s=10.00&n=1'],
    ['a date that does not exist', `t=20260231T1630&s=10&${FISCAL}&n=1`],
    ['a time that does not exist', `t=20261014T2560&s=10&${FISCAL}&n=1`],
    ['a zero total', `t=20261014T1630&s=0.00&${FISCAL}&n=1`],
    ['a total that is not a number', `t=20261014T1630&s=abc&${FISCAL}&n=1`],
    ['an unknown operation', `t=20261014T1630&s=10&${FISCAL}&n=7`],
  ])('is not a receipt: %s', (_, text) => {
    expect(parseFiscalQr(text)).toBeUndefined();
  });
});
