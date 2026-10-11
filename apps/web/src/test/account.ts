import { http, HttpResponse } from 'msw';
import type { Schemas } from '@/shared/api';
import { API_URL } from '@/shared/config/env';
import { apiUrl, MAIN_ACCOUNT } from './api';
import { server } from './server';

type Account = Schemas['Account'];
type Category = Schemas['Category'];
type Transaction = Schemas['Transaction'];
type CreateAccount = Schemas['CreateAccountRequest'];
type CreateCategory = Schemas['CreateCategoryRequest'];
type TransactionInput = Schemas['TransactionInput'];

interface AccountData {
  /** Default: the main account every new user has. */
  accounts?: Account[];
  categories?: Category[];
  transactions?: Transaction[];
  summary?: Schemas['TransactionSummary'];
  /** What GET /transactions/by-category answers, whatever the query. */
  categoryTotals?: Schemas['CategoryTotal'][];
}

let nextId = 1;
const newId = () =>
  `0199d0a4-3333-7000-8000-${String(nextId++).padStart(12, '0')}`;

const ref = ({ id, name, type }: Account) => ({ id, name, type });

/**
 * An in-memory API for the signed-in pages: what a test creates or deletes
 * shows up in the next list request, as with the real server. Returns the
 * state and the request bodies the app sent.
 */
export function mockAccount({
  accounts = [MAIN_ACCOUNT],
  categories = [],
  transactions = [],
  summary = { income: '0.00', expense: '0.00', balance: '0.00' },
  categoryTotals = [],
}: AccountData = {}) {
  const state = {
    accounts: accounts.map((account) => ({ ...account })),
    categories: categories.map((category) => ({ ...category })),
    transactions: [...transactions],
  };
  const sent = {
    accounts: [] as CreateAccount[],
    categories: [] as CreateCategory[],
    transactions: [] as TransactionInput[],
    replacements: [] as TransactionInput[],
  };

  /** A transaction as the API builds it from a request body. */
  const build = (body: TransactionInput, id = newId()): Transaction => {
    const account = state.accounts.find((a) => a.id === body.accountId);
    if (!account) throw new Error(`unknown account ${body.accountId}`);
    const common = {
      id,
      // The real API stores numeric(14,2) and answers with 2 decimals.
      amount: Number(body.amount).toFixed(2),
      comment: body.comment || null,
      occurredAt: body.occurredAt,
      createdAt: new Date().toISOString(),
      account: ref(account),
    };
    if (body.type === 'transfer') {
      const to = state.accounts.find((a) => a.id === body.toAccountId);
      if (!to) throw new Error(`unknown account ${body.toAccountId}`);
      return { ...common, type: 'transfer', toAccount: ref(to) };
    }
    const category = state.categories.find((c) => c.id === body.categoryId);
    if (!category) throw new Error(`unknown category ${body.categoryId}`);
    return { ...common, type: body.type, category };
  };

  server.use(
    http.get(apiUrl('/accounts'), () =>
      HttpResponse.json({
        items: state.accounts,
        // Test data only: the real total is summed exactly by the API.
        total: state.accounts
          .reduce((sum, account) => sum + Number(account.balance), 0)
          .toFixed(2),
      }),
    ),
    http.post(apiUrl('/accounts'), async ({ request }) => {
      const body = (await request.json()) as CreateAccount;
      sent.accounts.push(body);
      const openingBalance = Number(body.openingBalance ?? 0).toFixed(2);
      const created: Account = {
        id: newId(),
        name: body.name,
        type: body.type,
        openingBalance,
        allowNegative: body.allowNegative ?? true,
        balance: openingBalance,
      };
      state.accounts.push(created);
      return HttpResponse.json(created, { status: 201 });
    }),
    http.patch(`${API_URL}/accounts/:id`, async ({ params, request }) => {
      const body = (await request.json()) as Partial<CreateAccount>;
      const account = state.accounts.find((a) => a.id === params.id);
      if (!account) return new HttpResponse(null, { status: 404 });
      Object.assign(account, {
        ...body,
        ...(body.openingBalance !== undefined && {
          openingBalance: Number(body.openingBalance).toFixed(2),
        }),
      });
      return HttpResponse.json(account);
    }),
    http.delete(`${API_URL}/accounts/:id`, ({ params }) => {
      state.accounts = state.accounts.filter((a) => a.id !== params.id);
      return new HttpResponse(null, { status: 204 });
    }),

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
        if (t.type !== 'transfer' && t.category.id === category.id)
          t.category = { ...category };
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
      const body = (await request.json()) as TransactionInput;
      sent.transactions.push(body);
      const created = build(body);
      state.transactions.unshift(created);
      return HttpResponse.json(created, { status: 201 });
    }),
    http.put(`${API_URL}/transactions/:id`, async ({ params, request }) => {
      const body = (await request.json()) as TransactionInput;
      sent.replacements.push(body);
      const index = state.transactions.findIndex((t) => t.id === params.id);
      if (index < 0) return new HttpResponse(null, { status: 404 });
      const replaced = build(body, String(params.id));
      state.transactions[index] = replaced;
      return HttpResponse.json(replaced);
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
