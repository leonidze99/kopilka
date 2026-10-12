import {
  type ApiPath,
  baseApi,
  type RequestBody,
  type ResponseBody,
} from '@/shared/api';

export type Category = ResponseBody<'/categories', 'get', 200>[number];

export const categoryApi = baseApi
  // Transactions and budgets carry the name of their category: a rename
  // refetches them; a deleted category takes its budget with it.
  .enhanceEndpoints({ addTagTypes: ['Category', 'Transaction', 'Budget'] })
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
        invalidatesTags: ['Category', 'Transaction', 'Budget'],
      }),

      deleteCategory: build.mutation<void, string>({
        query: (id) => ({ url: `/categories/${id}`, method: 'DELETE' }),
        invalidatesTags: ['Category', 'Budget'],
      }),
    }),
  });

export const {
  useListCategoriesQuery,
  useCreateCategoryMutation,
  useRenameCategoryMutation,
  useDeleteCategoryMutation,
} = categoryApi;
