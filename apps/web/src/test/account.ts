import { http, HttpResponse } from 'msw';
import type { Schemas } from '@/shared/api';
import { API_URL } from '@/shared/config/env';
import { apiUrl, emptyMonths, MAIN_ACCOUNT } from './api';
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
  /** Months GET /transactions/monthly has data for; the others are zeros. */
  monthly?: Schemas['MonthlyTotal'][];
  /** Limits of the month, whatever the month asked. */
  budgets?: Budget[];
  recurring?: RecurringRule[];
  goals?: Goal[];
}

type RecurringRule = Schemas['RecurringRule'];
type RecurringInput = Schemas['RecurringInput'];

type Budget = Schemas['Budget'];
type Goal = Schemas['Goal'];
type GoalInput = Schemas['GoalInput'];
type SetBudget = Schemas['SetBudgetRequest'] & { categoryId: string };

// Test data only: the real API sums money exactly in the database.
const sum = (values: string[]) =>
  values.reduce((total, value) => total + Number(value), 0).toFixed(2);

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
  monthly = [],
  budgets = [],
  recurring = [],
  goals = [],
}: AccountData = {}) {
  const state = {
    budgets: [...budgets],
    recurring: [...recurring],
    goals: [...goals],
    accounts: accounts.map((account) => ({ ...account })),
    categories: categories.map((category) => ({ ...category })),
    transactions: [...transactions],
  };
  const sent = {
    accounts: [] as CreateAccount[],
    budgets: [] as SetBudget[],
    recurring: [] as RecurringInput[],
    goals: [] as GoalInput[],
    categories: [] as CreateCategory[],
    transactions: [] as TransactionInput[],
    replacements: [] as TransactionInput[],
  };

  /** The progress of a goal: the balance of its account against the target. */
  const withProgress = (goal: Goal): Goal => {
    const account = state.accounts.find((a) => a.id === goal.account.id);
    const saved = Math.max(Number(account?.balance ?? 0), 0);
    const target = Number(goal.targetAmount);
    return {
      ...goal,
      saved: saved.toFixed(2),
      remaining: Math.max(target - saved, 0).toFixed(2),
      percent: Math.min(100, Math.floor((saved / target) * 100)),
    };
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
      recurringRuleId: null,
    };
    if (body.type === 'transfer') {
      const to = state.accounts.find((a) => a.id === body.toAccountId);
      if (!to) throw new Error(`unknown account ${body.toAccountId}`);
      return { ...common, type: 'transfer', toAccount: ref(to) };
    }
    const categoryOf = (id: string | undefined) => {
      const category = state.categories.find((c) => c.id === id);
      if (!category) throw new Error(`unknown category ${id}`);
      return category;
    };
    if (body.splits) {
      return {
        ...common,
        type: body.type,
        category: null,
        splits: body.splits
          .map((split) => ({
            category: categoryOf(split.categoryId),
            amount: Number(split.amount).toFixed(2),
          }))
          // Largest first, as the API orders them.
          .sort((a, b) => Number(b.amount) - Number(a.amount)),
      };
    }
    return {
      ...common,
      type: body.type,
      category: categoryOf(body.categoryId),
      splits: [],
    };
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
      for (const t of state.transactions) {
        if (t.type === 'transfer') continue;
        if (t.category?.id === category.id) t.category = { ...category };
        for (const split of t.splits)
          if (split.category.id === category.id)
            split.category = { ...category };
      }
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
    http.get(apiUrl('/transactions/monthly'), ({ request }) =>
      HttpResponse.json(
        emptyMonths(new URL(request.url)).map(
          (zero) => monthly.find((m) => m.month === zero.month) ?? zero,
        ),
      ),
    ),
    http.get(apiUrl('/transactions/by-category'), () =>
      HttpResponse.json(categoryTotals),
    ),

    // Saving goals: what is saved is the balance of the account, as the
    // real API counts it.
    http.get(apiUrl('/goals'), () =>
      HttpResponse.json(state.goals.map(withProgress)),
    ),
    http.post(apiUrl('/goals'), async ({ request }) => {
      const body = (await request.json()) as GoalInput;
      sent.goals.push(body);
      const account = state.accounts.find((a) => a.id === body.accountId);
      if (!account) throw new Error(`unknown account ${body.accountId}`);
      const goal = {
        id: newId(),
        name: body.name,
        account: ref(account),
        targetAmount: Number(body.targetAmount).toFixed(2),
        targetDate: body.targetDate ?? null,
        saved: '0.00',
        remaining: '0.00',
        percent: 0,
        monthly: null,
      };
      state.goals.push(goal);
      return HttpResponse.json(withProgress(goal), { status: 201 });
    }),
    http.delete(`${API_URL}/goals/:id`, ({ params }) => {
      state.goals = state.goals.filter((goal) => goal.id !== params.id);
      return new HttpResponse(null, { status: 204 });
    }),

    http.get(apiUrl('/recurring'), () => HttpResponse.json(state.recurring)),
    http.post(apiUrl('/recurring'), async ({ request }) => {
      const body = (await request.json()) as RecurringInput;
      sent.recurring.push(body);
      const account = state.accounts.find((a) => a.id === body.accountId);
      if (!account) throw new Error(`unknown account ${body.accountId}`);
      const common = {
        id: newId(),
        amount: Number(body.amount).toFixed(2),
        comment: body.comment || null,
        account: ref(account),
        startOn: body.startOn,
        every: body.every ?? 1,
        unit: body.unit ?? 'month',
        timeZone: body.timeZone,
        active: body.active ?? true,
        nextOn: body.startOn,
        lastError: null,
      };
      let created: RecurringRule;
      if (body.type === 'transfer') {
        const to = state.accounts.find((a) => a.id === body.toAccountId);
        if (!to) throw new Error(`unknown account ${body.toAccountId}`);
        created = { ...common, type: 'transfer', toAccount: ref(to) };
      } else {
        const category = state.categories.find((c) => c.id === body.categoryId);
        if (!category) throw new Error(`unknown category ${body.categoryId}`);
        created = { ...common, type: body.type, category };
      }
      state.recurring.push(created);
      return HttpResponse.json(created, { status: 201 });
    }),

    http.get(apiUrl('/budgets'), () => {
      const limit = sum(state.budgets.map((budget) => budget.limit));
      const spent = sum(state.budgets.map((budget) => budget.spent));
      return HttpResponse.json({
        items: state.budgets,
        total: { limit, spent, remaining: (+limit - +spent).toFixed(2) },
      });
    }),
    http.put(`${API_URL}/budgets/:categoryId`, async ({ params, request }) => {
      const body = (await request.json()) as Schemas['SetBudgetRequest'];
      const categoryId = String(params.categoryId);
      sent.budgets.push({ categoryId, ...body });
      const existing = state.budgets.find((b) => b.category.id === categoryId);
      state.budgets = state.budgets.filter((b) => b !== existing);
      if (body.amount !== null) {
        const category = state.categories.find((c) => c.id === categoryId);
        if (!category) return new HttpResponse(null, { status: 404 });
        const limit = Number(body.amount).toFixed(2);
        const spent = existing?.spent ?? '0.00';
        state.budgets.push({
          category,
          limit,
          spent,
          remaining: (+limit - +spent).toFixed(2),
          since: body.month,
        });
      }
      return new HttpResponse(null, { status: 204 });
    }),
  );

  return { state, sent };
}
