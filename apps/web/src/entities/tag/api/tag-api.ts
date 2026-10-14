import {
  type ApiPath,
  baseApi,
  type RequestBody,
  type ResponseBody,
} from '@/shared/api';

export type Tag = ResponseBody<'/tags', 'get', 200>[number];

export const tagApi = baseApi
  // Transactions carry the names of their tags: a rename or a delete
  // refetches them.
  .enhanceEndpoints({ addTagTypes: ['Tag', 'Transaction'] })
  .injectEndpoints({
    endpoints: (build) => ({
      listTags: build.query<Tag[], void>({
        query: () => '/tags' satisfies ApiPath,
        providesTags: ['Tag'],
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

      deleteTag: build.mutation<void, string>({
        query: (id) => ({ url: `/tags/${id}`, method: 'DELETE' }),
        invalidatesTags: ['Tag', 'Transaction'],
      }),
    }),
  });

export const { useListTagsQuery, useRenameTagMutation, useDeleteTagMutation } =
  tagApi;
