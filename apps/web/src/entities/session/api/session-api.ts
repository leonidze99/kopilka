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

    /**
     * Asks for a link by email. Succeeds whether or not the address is
     * registered — the API answers the same, on purpose.
     */
    forgotPassword: build.mutation<
      void,
      RequestBody<'/auth/password/forgot', 'post'>
    >({
      query: (body) => ({
        url: '/auth/password/forgot' satisfies ApiPath,
        method: 'POST',
        body,
      }),
    }),

    /** Sets the password with the token from the emailed link. */
    resetPassword: build.mutation<
      void,
      RequestBody<'/auth/password/reset', 'post'>
    >({
      query: (body) => ({
        url: '/auth/password/reset' satisfies ApiPath,
        method: 'POST',
        body,
      }),
    }),
  }),
});

export type AuthSession = ResponseBody<'/auth/sessions', 'get', 200>[number];

/** The signed-in devices and the password: account security. */
export const securityApi = sessionApi
  .enhanceEndpoints({ addTagTypes: ['AuthSession'] })
  .injectEndpoints({
    endpoints: (build) => ({
      listSessions: build.query<AuthSession[], void>({
        query: () => '/auth/sessions' satisfies ApiPath,
        providesTags: ['AuthSession'],
      }),

      endSession: build.mutation<void, string>({
        query: (id) => ({ url: `/auth/sessions/${id}`, method: 'DELETE' }),
        invalidatesTags: ['AuthSession'],
      }),

      endOtherSessions: build.mutation<void, void>({
        query: () => ({
          url: '/auth/sessions' satisfies ApiPath,
          method: 'DELETE',
        }),
        invalidatesTags: ['AuthSession'],
      }),

      /** Ends the other sessions too: the list changes. */
      changePassword: build.mutation<
        void,
        RequestBody<'/auth/password', 'post'>
      >({
        query: (body) => ({
          url: '/auth/password' satisfies ApiPath,
          method: 'POST',
          body,
        }),
        invalidatesTags: ['AuthSession'],
      }),
    }),
  });

export const {
  useLoginMutation,
  useRegisterMutation,
  useRestoreSessionMutation,
  useLogoutMutation,
  useMeQuery,
  useForgotPasswordMutation,
  useResetPasswordMutation,
} = sessionApi;

export const {
  useListSessionsQuery,
  useEndSessionMutation,
  useEndOtherSessionsMutation,
  useChangePasswordMutation,
} = securityApi;
