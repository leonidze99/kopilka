import {
  type ApiPath,
  baseApi,
  type RequestBody,
  type ResponseBody,
} from '@/shared/api';

export type Category = ResponseBody<'/categories', 'get', 200>[number];

export const categoryApi = baseApi
  // Transactions carry the name of their category: a rename refetches them.
  .enhanceEndpoints({ addTagTypes: ['Category', 'Transaction'] })
  .injectEndpoints({
    endpoints: (build) => ({
      listCategories: build.query<Category[], void>({
        query: () => '/categories' satisfies ApiPath,
        providesTags: ['Category'],
      }),

      createCategory: build.mutation<
        Category,
        RequestBody<'/categories', 'post'>
      >({
        query: (body) => ({
          url: '/categories' satisfies ApiPath,
          method: 'POST',
          body,
        }),
        invalidatesTags: ['Category'],
      }),

      renameCategory: build.mutation<
        Category,
        { id: string } & RequestBody<'/categories/{id}', 'patch'>
      >({
        query: ({ id, ...body }) => ({
          url: `/categories/${id}`,
          method: 'PATCH',
          body,
        }),
        invalidatesTags: ['Category', 'Transaction'],
      }),

      deleteCategory: build.mutation<void, string>({
        query: (id) => ({ url: `/categories/${id}`, method: 'DELETE' }),
        invalidatesTags: ['Category'],
      }),
    }),
  });

export const {
  useListCategoriesQuery,
  useCreateCategoryMutation,
  useRenameCategoryMutation,
  useDeleteCategoryMutation,
} = categoryApi;
