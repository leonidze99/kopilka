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

/** Dates as ISO strings: what goes into the query string. */
export interface Period {
  from: string;
  to: string;
}

export const transactionApi = baseApi
  .enhanceEndpoints({ addTagTypes: ['Transaction'] })
  .injectEndpoints({
    endpoints: (build) => ({
      /**
       * Cursor pagination: each page's nextCursor is the page param of the
       * next one. RTK Query keeps the loaded pages together and refetches
       * them all after an invalidation.
       */
      listTransactions: build.infiniteQuery<
        TransactionPage,
        void,
        string | null
      >({
        infiniteQueryOptions: {
          initialPageParam: null,
          getNextPageParam: (lastPage) => lastPage.nextCursor,
        },
        query: ({ pageParam }) => ({
          url: '/transactions' satisfies ApiPath,
          params: pageParam ? { cursor: pageParam } : undefined,
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

      deleteTransaction: build.mutation<void, string>({
        query: (id) => ({ url: `/transactions/${id}`, method: 'DELETE' }),
        invalidatesTags: ['Transaction'],
      }),
    }),
  });

export const {
  useListTransactionsInfiniteQuery,
  useTransactionSummaryQuery,
  useCreateTransactionMutation,
  useDeleteTransactionMutation,
} = transactionApi;
