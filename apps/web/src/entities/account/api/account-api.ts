import {
  type ApiPath,
  baseApi,
  type RequestBody,
  type ResponseBody,
} from '@/shared/api';

export type AccountList = ResponseBody<'/accounts', 'get', 200>;
export type Account = AccountList['items'][number];

export const accountApi = baseApi
  // Transactions show the names of their accounts: a rename refetches them.
  // A balance is what a saving goal counts as saved.
  // Archiving stops the account's recurring rules.
  .enhanceEndpoints({
    addTagTypes: ['Account', 'Transaction', 'Goal', 'Recurring'],
  })
  .injectEndpoints({
    endpoints: (build) => ({
      /** With balances and their total, computed by the API. */
      listAccounts: build.query<AccountList, void>({
        query: () => '/accounts' satisfies ApiPath,
        providesTags: ['Account'],
      }),

      createAccount: build.mutation<Account, RequestBody<'/accounts', 'post'>>({
        query: (body) => ({
          url: '/accounts' satisfies ApiPath,
          method: 'POST',
          body,
        }),
        invalidatesTags: ['Account'],
      }),

      updateAccount: build.mutation<
        Account,
        { id: string } & RequestBody<'/accounts/{id}', 'patch'>
      >({
        query: ({ id, ...body }) => ({
          url: `/accounts/${id}`,
          method: 'PATCH',
          body,
        }),
        invalidatesTags: ['Account', 'Transaction', 'Goal'],
      }),

      /** Only with a zero balance; its recurring rules stop. */
      archiveAccount: build.mutation<
        ResponseBody<'/accounts/{id}/archive', 'post', 200>,
        string
      >({
        query: (id) => ({ url: `/accounts/${id}/archive`, method: 'POST' }),
        invalidatesTags: ['Account', 'Recurring', 'Goal'],
      }),

      unarchiveAccount: build.mutation<Account, string>({
        query: (id) => ({ url: `/accounts/${id}/unarchive`, method: 'POST' }),
        invalidatesTags: ['Account'],
      }),

      deleteAccount: build.mutation<void, string>({
        query: (id) => ({ url: `/accounts/${id}`, method: 'DELETE' }),
        invalidatesTags: ['Account', 'Goal'],
      }),
    }),
  });

export const {
  useListAccountsQuery,
  useCreateAccountMutation,
  useUpdateAccountMutation,
  useArchiveAccountMutation,
  useUnarchiveAccountMutation,
  useDeleteAccountMutation,
} = accountApi;
