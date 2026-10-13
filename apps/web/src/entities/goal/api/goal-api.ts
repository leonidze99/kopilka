import {
  type ApiPath,
  baseApi,
  type RequestBody,
  type ResponseBody,
} from '@/shared/api';

export type Goal = ResponseBody<'/goals', 'get', 200>[number];
export type GoalInput = RequestBody<'/goals', 'post'>;

export const goalApi = baseApi
  // What is saved is an account balance, so any money that moves changes it.
  .enhanceEndpoints({ addTagTypes: ['Goal'] })
  .injectEndpoints({
    endpoints: (build) => ({
      listGoals: build.query<Goal[], void>({
        query: () => '/goals' satisfies ApiPath,
        providesTags: ['Goal'],
      }),

      createGoal: build.mutation<Goal, GoalInput>({
        query: (body) => ({
          url: '/goals' satisfies ApiPath,
          method: 'POST',
          body,
        }),
        invalidatesTags: ['Goal'],
      }),

      replaceGoal: build.mutation<Goal, { id: string; body: GoalInput }>({
        query: ({ id, body }) => ({
          url: `/goals/${id}`,
          method: 'PUT',
          body,
        }),
        invalidatesTags: ['Goal'],
      }),

      deleteGoal: build.mutation<void, string>({
        query: (id) => ({ url: `/goals/${id}`, method: 'DELETE' }),
        invalidatesTags: ['Goal'],
      }),
    }),
  });

export const {
  useListGoalsQuery,
  useCreateGoalMutation,
  useReplaceGoalMutation,
  useDeleteGoalMutation,
} = goalApi;
