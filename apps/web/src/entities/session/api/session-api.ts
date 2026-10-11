import {
  type ApiPath,
  baseApi,
  refreshSession,
  type RequestBody,
  type ResponseBody,
  sessionEnded,
  sessionStarted,
} from '@/shared/api';

type AuthResponse = ResponseBody<'/auth/login', 'post', 200>;

export const sessionApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    login: build.mutation<AuthResponse, RequestBody<'/auth/login', 'post'>>({
      query: (body) => ({
        url: '/auth/login' satisfies ApiPath,
        method: 'POST',
        body,
      }),
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        const { data } = await queryFulfilled.catch(() => ({ data: null }));
        if (data) dispatch(sessionStarted(data));
      },
    }),

    register: build.mutation<
      ResponseBody<'/auth/register', 'post', 201>,
      RequestBody<'/auth/register', 'post'>
    >({
      query: (body) => ({
        url: '/auth/register' satisfies ApiPath,
        method: 'POST',
        body,
      }),
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        const { data } = await queryFulfilled.catch(() => ({ data: null }));
        if (data) dispatch(sessionStarted(data));
      },
    }),

    /**
     * Restores the session from the refresh cookie on page load: the access
     * token lives only in memory and is gone after a reload.
     */
    restoreSession: build.mutation<AuthResponse | null, void>({
      queryFn: async (_arg, api, extraOptions) => ({
        data: await refreshSession(api, extraOptions as object),
      }),
    }),

    logout: build.mutation<void, void>({
      query: () => ({ url: '/auth/logout' satisfies ApiPath, method: 'POST' }),
      // The local session ends even if the request fails: the user asked to
      // leave, and a stale cookie dies on its next use anyway.
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        await queryFulfilled.catch(() => undefined);
        dispatch(sessionEnded());
        // Drop cached data of the previous user.
        dispatch(baseApi.util.resetApiState());
      },
    }),

    me: build.query<ResponseBody<'/auth/me', 'get', 200>, void>({
      query: () => '/auth/me' satisfies ApiPath,
    }),
  }),
});

export const {
  useLoginMutation,
  useRegisterMutation,
  useRestoreSessionMutation,
  useLogoutMutation,
  useMeQuery,
} = sessionApi;
