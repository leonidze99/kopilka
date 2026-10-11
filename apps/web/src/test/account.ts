import { http, HttpResponse } from 'msw';
import type { Schemas } from '@/shared/api';
import { API_URL } from '@/shared/config/env';
import { apiUrl } from './api';
import { server } from './server';

type Category = Schemas['Category'];
type Transaction = Schemas['Transaction'];
type CreateCategory = Schemas['CreateCategoryRequest'];
type CreateTransaction = Schemas['CreateTransactionRequest'];
type UpdateTransaction = Schemas['UpdateTransactionRequest'];

interface AccountData {
  categories?: Category[];
  transactions?: Transaction[];
  summary?: Schemas['TransactionSummary'];
  /** What GET /transactions/by-category answers, whatever the query. */
  categoryTotals?: Schemas['CategoryTotal'][];
}

let nextId = 1;
const newId = () =>
  `0199d0a4-3333-7000-8000-${String(nextId++).padStart(12, '0')}`;

/**
 * An in-memory API for the signed-in pages: what a test creates or deletes
 * shows up in the next list request, as with the real server. Returns the
 * state and the request bodies the app sent.
 */
export function mockAccount({
  categories = [],
  transactions = [],
  summary = { income: '0.00', expense: '0.00', balance: '0.00' },
  categoryTotals = [],
}: AccountData = {}) {
  const state = {
    categories: categories.map((category) => ({ ...category })),
    transactions: [...transactions],
  };
  const sent = {
    categories: [] as CreateCategory[],
    transactions: [] as CreateTransaction[],
    updates: [] as UpdateTransaction[],
  };

  server.use(
    http.get(apiUrl('/categories'), () => HttpResponse.json(state.categories)),
    http.post(apiUrl('/categories'), async ({ request }) => {
      const body = (await request.json()) as CreateCategory;
      sent.categories.push(body);
      const created: Category = { id: newId(), ...body };
      state.categories.push(created);
      return HttpResponse.json(created, { status: 201 });
    }),
    http.patch(`${API_URL}/categories/:id`, async ({ params, request }) => {
      const { name } = (await request.json()) as { name: string };
      const category = state.categories.find((c) => c.id === params.id);
      if (!category) return new HttpResponse(null, { status: 404 });
      category.name = name;
      for (const t of state.transactions)
        if (t.category.id === category.id) t.category = { ...category };
      return HttpResponse.json(category);
    }),
    http.delete(`${API_URL}/categories/:id`, ({ params }) => {
      state.categories = state.categories.filter((c) => c.id !== params.id);
      return new HttpResponse(null, { status: 204 });
    }),

    http.get(apiUrl('/transactions'), () =>
      HttpResponse.json({ items: state.transactions, nextCursor: null }),
    ),
    http.post(apiUrl('/transactions'), async ({ request }) => {
      const body = (await request.json()) as CreateTransaction;
      sent.transactions.push(body);
      const category = state.categories.find((c) => c.id === body.categoryId);
      if (!category) throw new Error(`unknown category ${body.categoryId}`);
      const created: Transaction = {
        id: newId(),
        // The real API stores numeric(14,2) and answers with 2 decimals.
        amount: Number(body.amount).toFixed(2),
        comment: body.comment || null,
        occurredAt: body.occurredAt,
        createdAt: new Date().toISOString(),
        category,
      };
      state.transactions.unshift(created);
      return HttpResponse.json(created, { status: 201 });
    }),
    http.patch(`${API_URL}/transactions/:id`, async ({ params, request }) => {
      const body = (await request.json()) as UpdateTransaction;
      sent.updates.push(body);
      const index = state.transactions.findIndex((t) => t.id === params.id);
      const current = state.transactions[index];
      if (!current) return new HttpResponse(null, { status: 404 });
      const category =
        state.categories.find((c) => c.id === body.categoryId) ??
        current.category;
      const updated: Transaction = {
        ...current,
        ...(body.amount && { amount: Number(body.amount).toFixed(2) }),
        ...(body.occurredAt && { occurredAt: body.occurredAt }),
        ...(body.comment !== undefined && { comment: body.comment || null }),
        category,
      };
      state.transactions[index] = updated;
      return HttpResponse.json(updated);
    }),
    http.delete(`${API_URL}/transactions/:id`, ({ params }) => {
      state.transactions = state.transactions.filter((t) => t.id !== params.id);
      return new HttpResponse(null, { status: 204 });
    }),

    http.get(apiUrl('/transactions/summary'), () => HttpResponse.json(summary)),
    http.get(apiUrl('/transactions/by-category'), () =>
      HttpResponse.json(categoryTotals),
    ),
  );

  return { state, sent };
}
