import { type ApiPath, baseApi, type ResponseBody } from '@/shared/api';

export type Receipt = ResponseBody<'/transactions/{id}/receipts', 'post', 201>;

export type ReceiptVariant = 'image' | 'thumbnail';

export type ReceiptScan = ResponseBody<'/receipts/scan', 'post', 200>;

export const receiptApi = baseApi
  // A transaction lists its receipts: adding or deleting one refetches it.
  .enhanceEndpoints({ addTagTypes: ['Transaction'] })
  .injectEndpoints({
    endpoints: (build) => ({
      /**
       * The image as an object URL for <img src>. An <img> cannot send the
       * access token, so the bytes come through the API layer (token,
       * refresh on 401) and the browser gets a blob: URL. A string is what
       * the store keeps; the blob itself lives outside it and is released
       * when the cache entry goes.
       */
      receiptImage: build.query<
        string,
        { id: string; variant: ReceiptVariant }
      >({
        query: ({ id, variant }) => ({
          url: `/receipts/${id}/${variant}`,
          // A failed response is the usual ApiError JSON.
          responseHandler: async (response) =>
            response.ok
              ? URL.createObjectURL(await response.blob())
              : response.json(),
        }),
        // A receipt never changes: no refetch, a while in the cache.
        keepUnusedDataFor: 300,
        async onCacheEntryAdded(_arg, { cacheDataLoaded, cacheEntryRemoved }) {
          const loaded = await cacheDataLoaded.catch(() => undefined);
          await cacheEntryRemoved;
          if (loaded) URL.revokeObjectURL(loaded.data);
        },
      }),

      uploadReceipt: build.mutation<
        Receipt,
        { transactionId: string; file: File }
      >({
        query: ({ transactionId, file }) => {
          // fetch sets multipart/form-data with the boundary for FormData.
          const body = new FormData();
          body.append('file', file);
          return {
            url: `/transactions/${transactionId}/receipts`,
            method: 'POST',
            body,
          };
        },
        invalidatesTags: ['Transaction'],
      }),

      deleteReceipt: build.mutation<void, string>({
        query: (id) => ({ url: `/receipts/${id}`, method: 'DELETE' }),
        invalidatesTags: ['Transaction'],
      }),

      /**
       * What the QR code on a photo says. A mutation: an action on a file
       * that stores nothing, not data to cache.
       */
      scanReceipt: build.mutation<ReceiptScan, File>({
        query: (file) => {
          const body = new FormData();
          body.append('file', file);
          return {
            url: '/receipts/scan' satisfies ApiPath,
            method: 'POST',
            body,
          };
        },
      }),
    }),
  });

export const {
  useReceiptImageQuery,
  useUploadReceiptMutation,
  useDeleteReceiptMutation,
  useScanReceiptMutation,
} = receiptApi;
