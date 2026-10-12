import {
  type ApiPath,
  baseApi,
  type RequestBody,
  type ResponseBody,
} from '@/shared/api';

type TransactionPage = ResponseBody<'/transactions', 'get', 200>;
export type Transaction = TransactionPage['items'][number];
export type TransactionSummary = ResponseBody<
  '/transactions/summary',
  'get',
  200
>;
export type CategoryTotal = ResponseBody<
  '/transactions/by-category',
  'get',
  200
>[number];

export type MonthlyTotal = ResponseBody<
  '/transactions/monthly',
  'get',
  200
>[number];

export interface MonthlyTotalsParams {
  from: string;
  to: string;
  timeZone: string;
}

/** Dates as ISO strings: what goes into the query string. */
export interface Period {
  from: string;
  to: string;
}

export type TransactionType = Transaction['type'];

/**
 * What the list shows: a period (none: all time), narrowed to a type,
 * category or account, and to comments containing `q`.
 */
export interface TransactionFilter extends Partial<Period> {
  type?: TransactionType;
  categoryId?: string;
  accountId?: string;
  q?: string;
}

type TransactionInput = RequestBody<'/transactions', 'post'>;

// Every write moves money: account balances and budget spending change too.
const WRITE_TAGS = ['Transaction', 'Account', 'Budget'] as const;

export const transactionApi = baseApi
  .enhanceEndpoints({ addTagTypes: ['Transaction', 'Account', 'Budget'] })
  .injectEndpoints({
    endpoints: (build) => ({
      /**
       * Cursor pagination: each page's nextCursor is the page param of the
       * next one. RTK Query keeps the loaded pages of each filter together
       * and refetches them all after an invalidation.
       */
      listTransactions: build.infiniteQuery<
        TransactionPage,
        TransactionFilter,
        string | null
      >({
        infiniteQueryOptions: {
          initialPageParam: null,
          getNextPageParam: (lastPage) => lastPage.nextCursor,
        },
        query: ({ queryArg, pageParam }) => ({
          url: '/transactions' satisfies ApiPath,
          params: { ...queryArg, ...(pageParam && { cursor: pageParam }) },
        }),
        providesTags: ['Transaction'],
      }),

      transactionSummary: build.query<TransactionSummary, Period>({
        query: (period) => ({
          url: '/transactions/summary' satisfies ApiPath,
          params: period,
        }),
        providesTags: ['Transaction'],
      }),

      categoryTotals: build.query<
        CategoryTotal[],
        Period & { kind: 'income' | 'expense' }
      >({
        query: (params) => ({
          url: '/transactions/by-category' satisfies ApiPath,
          params,
        }),
        providesTags: ['Transaction'],
      }),

      /** Every month of [from, to], empty ones as zeros; months of `timeZone`. */
      monthlyTotals: build.query<MonthlyTotal[], MonthlyTotalsParams>({
        query: (params) => ({
          url: '/transactions/monthly' satisfies ApiPath,
          params,
        }),
        providesTags: ['Transaction'],
      }),

      createTransaction: build.mutation<Transaction, TransactionInput>({
        query: (body) => ({
          url: '/transactions' satisfies ApiPath,
          method: 'POST',
          body,
        }),
        invalidatesTags: WRITE_TAGS,
      }),

      /** The whole transaction: an edit may change its type too. */
      replaceTransaction: build.mutation<
        Transaction,
        { id: string; body: TransactionInput }
      >({
        query: ({ id, body }) => ({
          url: `/transactions/${id}`,
          method: 'PUT',
          body,
        }),
        invalidatesTags: WRITE_TAGS,
      }),

      deleteTransaction: build.mutation<void, string>({
        query: (id) => ({ url: `/transactions/${id}`, method: 'DELETE' }),
        invalidatesTags: WRITE_TAGS,
      }),
    }),
  });

export const {
  useListTransactionsInfiniteQuery,
  useTransactionSummaryQuery,
  useCategoryTotalsQuery,
  useMonthlyTotalsQuery,
  useCreateTransactionMutation,
  useReplaceTransactionMutation,
  useDeleteTransactionMutation,
} = transactionApi;
