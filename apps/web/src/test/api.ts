import type { ApiError, AuthResponse, ErrorCode } from '@kopilka/shared';
import { http, HttpResponse } from 'msw';
import { API_URL } from '@/shared/config/env';
import type { ApiPath, Schemas } from '@/shared/api';

export const apiUrl = (path: ApiPath) => `${API_URL}${path}`;

export const USER = {
  id: '0199d0a4-5b6e-7c3d-8e9f-0a1b2c3d4e5f',
  email: 'user@example.com',
  budgetAlerts: true,
  baseCurrency: 'RUB' as const,
};

export const authResponse = (accessToken = 'access-1'): AuthResponse => ({
  accessToken,
  expiresIn: 900,
  user: USER,
});

export const apiError = (
  status: number,
  code: ErrorCode,
  message: string,
  details?: ApiError['details'],
) =>
  HttpResponse.json<ApiError>(
    { code, message, requestId: 'req-test', details },
    { status },
  );

/** GET /transactions/monthly without transactions: zeros for every month asked. */
export function emptyMonths(url: URL) {
  const from = url.searchParams.get('from') ?? '';
  const to = url.searchParams.get('to') ?? '';
  const months: string[] = [];
  let [year, month] = from.split('-').map(Number) as [number, number];
  for (
    let key = from;
    key <= to;
    month = (month % 12) + 1,
      year += month === 1 ? 1 : 0,
      key = `${year}-${String(month).padStart(2, '0')}`
  ) {
    months.push(key);
  }
  return months.map((m) => ({
    month: m,
    income: '0.00',
    expense: '0.00',
    balance: '0.00',
  }));
}

/** The account every new user starts with. */
export const MAIN_ACCOUNT = {
  id: '0199d0a4-0000-7000-8000-0000000acc01',
  name: 'Основной счёт',
  type: 'card',
  currency: 'RUB',
  openingBalance: '0.00',
  allowNegative: true,
  balance: '0.00',
} as const;

/** What the signed-in pages load, for an account without any data yet. */
export const emptyAccount = () => [
  http.get(apiUrl('/accounts'), () =>
    HttpResponse.json({ items: [MAIN_ACCOUNT], total: '0.00' }),
  ),
  http.get(apiUrl('/categories'), () => HttpResponse.json([])),
  http.get(apiUrl('/transactions'), () =>
    HttpResponse.json({ items: [], nextCursor: null }),
  ),
  http.get(apiUrl('/transactions/summary'), () =>
    HttpResponse.json({ income: '0.00', expense: '0.00', balance: '0.00' }),
  ),
  http.get(apiUrl('/transactions/by-category'), () => HttpResponse.json([])),
  http.get(apiUrl('/transactions/monthly'), ({ request }) =>
    HttpResponse.json(emptyMonths(new URL(request.url))),
  ),
  http.get(apiUrl('/budgets'), () => HttpResponse.json(NO_BUDGETS)),
  http.get(apiUrl('/tags'), () => HttpResponse.json([])),
];

const NO_BUDGETS = {
  items: [],
  total: { limit: '0.00', spent: '0.00', remaining: '0.00' },
};

export const FOOD = {
  id: '0199d0a4-0000-7000-8000-00000000f00d',
  kind: 'expense',
  name: 'Продукты',
} as const;

export const SALARY = {
  id: '0199d0a4-0000-7000-8000-0000000005a1',
  kind: 'income',
  name: 'Зарплата',
} as const;

let nextId = 1;

const accountRef = {
  id: MAIN_ACCOUNT.id,
  name: MAIN_ACCOUNT.name,
  type: 'card',
  currency: 'RUB',
} as const;

type Receipt = Schemas['Receipt'];

type TestCategory = { id: string; kind: 'income' | 'expense'; name: string };

/**
 * An income or an expense (by its category) as the API returns it; with
 * `splits`, a split one: no category of its own, its parts' kind.
 */
export const transaction = (
  overrides: Partial<{
    amount: string;
    /** In the base currency; the amount itself by default. */
    baseAmount: string;
    account: {
      id: string;
      name: string;
      type: 'card' | 'cash' | 'savings';
      currency: Schemas['Currency'];
    };
    comment: string | null;
    occurredAt: string;
    category: TestCategory;
    splits: { category: TestCategory; amount: string }[];
    tags: { id: string; name: string }[];
    receipts: Receipt[];
  }> = {},
) => {
  const splits = overrides.splits ?? [];
  const category = splits.length ? null : (overrides.category ?? FOOD);
  return {
    id: `0199d0a4-1111-7000-8000-${String(nextId++).padStart(12, '0')}`,
    type: (category ?? splits[0]!.category).kind,
    amount: '100.00',
    comment: null,
    occurredAt: '2026-10-05T12:00:00.000Z',
    createdAt: '2026-10-05T12:00:00.000Z',
    account: accountRef,
    recurringRuleId: null,
    tags: [] as { id: string; name: string }[],
    receipts: [] as Receipt[],
    ...overrides,
    baseAmount: overrides.baseAmount ?? overrides.amount ?? '100.00',
    baseAmountManual: false,
    category,
    splits,
  };
};
