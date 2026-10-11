import type { ApiError, AuthResponse, ErrorCode } from '@kopilka/shared';
import { http, HttpResponse } from 'msw';
import { API_URL } from '@/shared/config/env';
import type { ApiPath } from '@/shared/api';

export const apiUrl = (path: ApiPath) => `${API_URL}${path}`;

export const USER = {
  id: '0199d0a4-5b6e-7c3d-8e9f-0a1b2c3d4e5f',
  email: 'user@example.com',
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

/** What the signed-in pages load, for an account without any data yet. */
export const emptyAccount = () => [
  http.get(apiUrl('/categories'), () => HttpResponse.json([])),
  http.get(apiUrl('/transactions'), () =>
    HttpResponse.json({ items: [], nextCursor: null }),
  ),
  http.get(apiUrl('/transactions/summary'), () =>
    HttpResponse.json({ income: '0.00', expense: '0.00', balance: '0.00' }),
  ),
];

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

/** A transaction as the API returns it. */
export const transaction = (
  overrides: Partial<{
    amount: string;
    comment: string | null;
    occurredAt: string;
    category: typeof FOOD | typeof SALARY;
  }> = {},
) => ({
  id: `0199d0a4-1111-7000-8000-${String(nextId++).padStart(12, '0')}`,
  amount: '100.00',
  comment: null,
  occurredAt: '2026-10-05T12:00:00.000Z',
  createdAt: '2026-10-05T12:00:00.000Z',
  category: FOOD,
  ...overrides,
});
