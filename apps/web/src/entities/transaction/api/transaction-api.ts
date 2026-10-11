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

/** Dates as ISO strings: what goes into the query string. */
export interface Period {
  from: string;
  to: string;
}

/** What the list shows: a period, narrowed to a kind or a category. */
export interface TransactionFilter extends Period {
  kind?: 'income' | 'expense';
  categoryId?: string;
}

export const transactionApi = baseApi
  .enhanceEndpoints({ addTagTypes: ['Transaction'] })
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

      createTransaction: build.mutation<
        Transaction,
        RequestBody<'/transactions', 'post'>
      >({
        query: (body) => ({
          url: '/transactions' satisfies ApiPath,
          method: 'POST',
          body,
        }),
        invalidatesTags: ['Transaction'],
      }),

      updateTransaction: build.mutation<
        Transaction,
        { id: string } & RequestBody<'/transactions/{id}', 'patch'>
      >({
        query: ({ id, ...body }) => ({
          url: `/transactions/${id}`,
          method: 'PATCH',
          body,
        }),
        invalidatesTags: ['Transaction'],
      }),

      deleteTransaction: build.mutation<void, string>({
        query: (id) => ({ url: `/transactions/${id}`, method: 'DELETE' }),
        invalidatesTags: ['Transaction'],
      }),
    }),
  });

export const {
  useListTransactionsInfiniteQuery,
  useTransactionSummaryQuery,
  useCategoryTotalsQuery,
  useCreateTransactionMutation,
  useUpdateTransactionMutation,
  useDeleteTransactionMutation,
} = transactionApi;
