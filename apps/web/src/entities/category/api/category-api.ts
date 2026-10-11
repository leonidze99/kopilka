import {
  type ApiPath,
  baseApi,
  type RequestBody,
  type ResponseBody,
} from '@/shared/api';

export type Category = ResponseBody<'/categories', 'get', 200>[number];

export const categoryApi = baseApi
  .enhanceEndpoints({ addTagTypes: ['Category'] })
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

      deleteCategory: build.mutation<void, string>({
        query: (id) => ({ url: `/categories/${id}`, method: 'DELETE' }),
        invalidatesTags: ['Category'],
      }),
    }),
  });

export const {
  useListCategoriesQuery,
  useCreateCategoryMutation,
  useDeleteCategoryMutation,
} = categoryApi;
