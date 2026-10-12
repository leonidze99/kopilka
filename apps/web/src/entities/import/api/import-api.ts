import {
  type ApiPath,
  baseApi,
  type RequestBody,
  type ResponseBody,
} from '@/shared/api';

export type Import = ResponseBody<'/imports/{id}', 'get', 200>;
export type ImportSummary = ResponseBody<'/imports', 'get', 200>[number];
export type ImportColumns = NonNullable<Import['columns']>;
export type ImportCategoryGroup = Import['categories'][number];
type ImportMapping = RequestBody<'/imports/{id}/mapping', 'put'>;
type ImportCommit = RequestBody<'/imports/{id}/commit', 'post'>;

/** The server works on the import: poll for progress. */
export const isImportBusy = (status: Import['status']) =>
  status === 'parsing' || status === 'importing';

export const importApi = baseApi
  // Transaction, Account, Budget: a finished import adds transactions.
  .enhanceEndpoints({
    addTagTypes: ['Import', 'Transaction', 'Account', 'Budget'],
  })
  .injectEndpoints({
    endpoints: (build) => ({
      listImports: build.query<ImportSummary[], void>({
        query: () => '/imports' satisfies ApiPath,
        providesTags: [{ type: 'Import', id: 'LIST' }],
      }),

      getImport: build.query<Import, string>({
        query: (id) => `/imports/${id}`,
        providesTags: (_result, _error, id) => [{ type: 'Import', id }],
        // The transactions appear when the background import finishes, not
        // when it is confirmed: refresh what shows them on the change to
        // "done", seen by polling.
        async onQueryStarted(id, { dispatch, queryFulfilled, getState }) {
          const before =
            importApi.endpoints.getImport.select(id)(getState()).data?.status;
          try {
            const { data } = await queryFulfilled;
            if (data.status === 'done' && before !== 'done') {
              dispatch(
                importApi.util.invalidateTags([
                  'Transaction',
                  'Account',
                  'Budget',
                  { type: 'Import', id: 'LIST' },
                ]),
              );
            }
          } catch {
            // The query shows its own error.
          }
        },
      }),

      uploadImport: build.mutation<Import, File>({
        query: (file) => {
          // fetch sets multipart/form-data with the boundary for FormData.
          const body = new FormData();
          body.append('file', file);
          return { url: '/imports' satisfies ApiPath, method: 'POST', body };
        },
        invalidatesTags: [{ type: 'Import', id: 'LIST' }],
        // The page of the new import opens without loading it again.
        async onQueryStarted(_file, { dispatch, queryFulfilled }) {
          const result = await queryFulfilled.catch(() => undefined);
          if (result) {
            dispatch(
              importApi.util.upsertQueryData(
                'getImport',
                result.data.id,
                result.data,
              ),
            );
          }
        },
      }),

      setImportMapping: build.mutation<
        Import,
        { id: string; body: ImportMapping }
      >({
        query: ({ id, body }) => ({
          url: `/imports/${id}/mapping`,
          method: 'PUT',
          body,
        }),
        invalidatesTags: [{ type: 'Import', id: 'LIST' }],
        // The answer is the whole import in its new status: into the cache,
        // so the page switches to it without another request.
        async onQueryStarted({ id }, { dispatch, queryFulfilled }) {
          const result = await queryFulfilled.catch(() => undefined);
          if (result) {
            dispatch(
              importApi.util.upsertQueryData('getImport', id, result.data),
            );
          }
        },
      }),

      commitImport: build.mutation<Import, { id: string; body: ImportCommit }>({
        query: ({ id, body }) => ({
          url: `/imports/${id}/commit`,
          method: 'POST',
          body,
        }),
        invalidatesTags: [{ type: 'Import', id: 'LIST' }],
        // The answer is the whole import in its new status: into the cache,
        // so the page switches to it without another request.
        async onQueryStarted({ id }, { dispatch, queryFulfilled }) {
          const result = await queryFulfilled.catch(() => undefined);
          if (result) {
            dispatch(
              importApi.util.upsertQueryData('getImport', id, result.data),
            );
          }
        },
      }),

      deleteImport: build.mutation<void, string>({
        query: (id) => ({ url: `/imports/${id}`, method: 'DELETE' }),
        invalidatesTags: [{ type: 'Import', id: 'LIST' }],
      }),
    }),
  });

export const {
  useListImportsQuery,
  useGetImportQuery,
  useUploadImportMutation,
  useSetImportMappingMutation,
  useCommitImportMutation,
  useDeleteImportMutation,
} = importApi;
