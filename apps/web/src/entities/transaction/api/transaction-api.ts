import {
  type ApiPath,
  baseApi,
  type QueryParams,
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

/** Tag totals overlap: a transaction with two tags counts in both. */
export type TagTotal = ResponseBody<'/transactions/by-tag', 'get', 200>[number];

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
 * category or account, to a tag, and to comments containing `q`.
 */
export interface TransactionFilter extends Partial<Period> {
  type?: TransactionType;
  categoryId?: string;
  accountId?: string;
  tagId?: string;
  q?: string;
}

type TransactionInput = RequestBody<'/transactions', 'post'>;

/** The filters of the feed plus the reader's time zone, for the CSV. */
export type ExportParams = QueryParams<'/transactions/export', 'get'>;

// Every write moves money: account balances and budget spending change
// too. A new tag name makes a new tag.
const WRITE_TAGS = ['Transaction', 'Account', 'Budget', 'Goal', 'Tag'] as const;

export const transactionApi = baseApi
  .enhanceEndpoints({
    addTagTypes: ['Transaction', 'Account', 'Budget', 'Goal', 'Tag'],
  })
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

      /** Over a period, or of one tag over all time. */
      transactionSummary: build.query<
        TransactionSummary,
        Partial<Period> & { tagId?: string }
      >({
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

      // A tag rename invalidates Transaction too: the names here follow.
      tagTotals: build.query<
        TagTotal[],
        Period & { kind: 'income' | 'expense' }
      >({
        query: (params) => ({
          url: '/transactions/by-tag' satisfies ApiPath,
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

      /**
       * The CSV of whatever the list is showing. A mutation, not a query:
       * it is an action with a file as its result, and caching a blob by
       * filter would only hold memory. The response is read as a blob —
       * the default handler would try to parse the file as JSON.
       */
      exportTransactions: build.mutation<Blob, ExportParams>({
        query: (params) => ({
          url: '/transactions/export' satisfies ApiPath,
          params: params as Record<string, string>,
          // Only a successful response is the file; a failed one is the
          // usual ApiError JSON, which the error message is built from.
          responseHandler: (response) =>
            response.ok ? response.blob() : response.json(),
        }),
      }),
    }),
  });

export const {
  useListTransactionsInfiniteQuery,
  useTransactionSummaryQuery,
  useCategoryTotalsQuery,
  useTagTotalsQuery,
  useMonthlyTotalsQuery,
  useCreateTransactionMutation,
  useReplaceTransactionMutation,
  useDeleteTransactionMutation,
  useExportTransactionsMutation,
} = transactionApi;
