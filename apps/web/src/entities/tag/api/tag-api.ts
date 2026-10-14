import {
  type ApiPath,
  baseApi,
  type RequestBody,
  type ResponseBody,
} from '@/shared/api';

/** A tag of the list, with its budget (a limit over all time) if set. */
export type Tag = ResponseBody<'/tags', 'get', 200>[number];
export type TagBudget = NonNullable<Tag['budget']>;

export const tagApi = baseApi
  // Transactions carry the names of their tags: a rename or a delete
  // refetches them.
  .enhanceEndpoints({ addTagTypes: ['Tag', 'Transaction'] })
  .injectEndpoints({
    endpoints: (build) => ({
      listTags: build.query<Tag[], void>({
        query: () => '/tags' satisfies ApiPath,
        // What a budgeted tag has cost changes with any transaction.
        providesTags: ['Tag', 'Transaction'],
      }),

      renameTag: build.mutation<
        Tag,
        { id: string } & RequestBody<'/tags/{id}', 'patch'>
      >({
        query: ({ id, ...body }) => ({
          url: `/tags/${id}`,
          method: 'PATCH',
          body,
        }),
        invalidatesTags: ['Tag', 'Transaction'],
      }),

      /** `amount: null` takes the limit off. */
      setTagBudget: build.mutation<
        void,
        { id: string } & RequestBody<'/tags/{id}/budget', 'put'>
      >({
        query: ({ id, ...body }) => ({
          url: `/tags/${id}/budget`,
          method: 'PUT',
          body,
        }),
        invalidatesTags: ['Tag'],
      }),

      deleteTag: build.mutation<void, string>({
        query: (id) => ({ url: `/tags/${id}`, method: 'DELETE' }),
        invalidatesTags: ['Tag', 'Transaction'],
      }),
    }),
  });

export const {
  useListTagsQuery,
  useRenameTagMutation,
  useSetTagBudgetMutation,
  useDeleteTagMutation,
} = tagApi;
