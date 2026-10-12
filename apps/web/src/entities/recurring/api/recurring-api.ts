import {
  type ApiPath,
  baseApi,
  type RequestBody,
  type ResponseBody,
} from '@/shared/api';

export type RecurringRule = ResponseBody<'/recurring', 'get', 200>[number];
type RecurringInput = RequestBody<'/recurring', 'post'>;

export const recurringApi = baseApi
  .enhanceEndpoints({ addTagTypes: ['Recurring'] })
  .injectEndpoints({
    endpoints: (build) => ({
      listRecurring: build.query<RecurringRule[], void>({
        query: () => '/recurring' satisfies ApiPath,
        providesTags: ['Recurring'],
      }),

      createRecurring: build.mutation<RecurringRule, RecurringInput>({
        query: (body) => ({
          url: '/recurring' satisfies ApiPath,
          method: 'POST',
          body,
        }),
        invalidatesTags: ['Recurring'],
      }),

      replaceRecurring: build.mutation<
        RecurringRule,
        { id: string; body: RecurringInput }
      >({
        query: ({ id, body }) => ({
          url: `/recurring/${id}`,
          method: 'PUT',
          body,
        }),
        invalidatesTags: ['Recurring'],
      }),

      deleteRecurring: build.mutation<void, string>({
        query: (id) => ({ url: `/recurring/${id}`, method: 'DELETE' }),
        invalidatesTags: ['Recurring'],
      }),
    }),
  });

export const {
  useListRecurringQuery,
  useCreateRecurringMutation,
  useReplaceRecurringMutation,
  useDeleteRecurringMutation,
} = recurringApi;
