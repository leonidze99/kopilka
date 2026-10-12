import {
  type ApiPath,
  baseApi,
  type RequestBody,
  type ResponseBody,
} from '@/shared/api';

export type BudgetList = ResponseBody<'/budgets', 'get', 200>;
export type Budget = BudgetList['items'][number];

export interface BudgetsArgs {
  /** "2026-10": which limits apply. */
  month: string;
  /** Bounds of the month in the user's time zone, for what was spent. */
  from: string;
  to: string;
}

export const budgetApi = baseApi
  .enhanceEndpoints({ addTagTypes: ['Budget'] })
  .injectEndpoints({
    endpoints: (build) => ({
      listBudgets: build.query<BudgetList, BudgetsArgs>({
        query: (params) => ({ url: '/budgets' satisfies ApiPath, params }),
        providesTags: ['Budget'],
      }),

      /** A limit from `month` on; `amount: null` stops it. */
      setBudget: build.mutation<
        void,
        { categoryId: string } & RequestBody<'/budgets/{categoryId}', 'put'>
      >({
        query: ({ categoryId, ...body }) => ({
          url: `/budgets/${categoryId}`,
          method: 'PUT',
          body,
        }),
        invalidatesTags: ['Budget'],
      }),
    }),
  });

export const { useListBudgetsQuery, useSetBudgetMutation } = budgetApi;
