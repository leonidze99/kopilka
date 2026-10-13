import { Navigate, type RouteObject } from 'react-router';
import { ForgotPasswordPage } from '@/pages/forgot-password';
import { LoginPage } from '@/pages/login';
import { RegisterPage } from '@/pages/register';
import { ResetPasswordPage } from '@/pages/reset-password';
import { PageLoader } from '@/shared/ui';
import { AppLayout } from '../layouts/AppLayout';
import { RootLayout } from '../layouts/RootLayout';
import { GuestOnly, RequireAuth } from './guards';

/**
 * Pages of the app load as separate chunks: the first screen carries the
 * shell and the router, not the transaction list, the import wizard and the
 * charts. The router waits for the chunk before it switches, so a page never
 * half-renders; the first load shows HydrateFallback meanwhile.
 *
 * The pages of a signed-out visitor stay in the first chunk: together they
 * weigh a few kilobytes, and they are what that visitor sees first — a
 * second round trip to show a login form buys nothing.
 */
const page =
  (load: () => Promise<Record<string, React.ComponentType>>, name: string) =>
  async () => ({ Component: (await load())[name]! });

export const routes: RouteObject[] = [
  {
    // Holds the toaster, so a toast raised before a redirect is still shown
    // on the page it lands on, even in another layout.
    element: <RootLayout />,
    HydrateFallback: PageLoader,
    children: [
      {
        element: <RequireAuth />,
        children: [
          {
            element: <AppLayout />,
            children: [
              {
                path: '/',
                lazy: page(
                  () => import('@/pages/transactions'),
                  'TransactionsPage',
                ),
              },
              {
                path: '/accounts',
                lazy: page(() => import('@/pages/accounts'), 'AccountsPage'),
              },
              {
                path: '/categories',
                lazy: page(
                  () => import('@/pages/categories'),
                  'CategoriesPage',
                ),
              },
              {
                path: '/recurring',
                lazy: page(() => import('@/pages/recurring'), 'RecurringPage'),
              },
              {
                path: '/import',
                lazy: page(() => import('@/pages/import'), 'ImportPage'),
              },
              {
                path: '/import/:id',
                lazy: page(() => import('@/pages/import'), 'ImportDetailsPage'),
              },
              {
                path: '/settings',
                lazy: page(() => import('@/pages/settings'), 'SettingsPage'),
              },
            ],
          },
        ],
      },
      {
        element: <GuestOnly />,
        children: [
          { path: '/login', element: <LoginPage /> },
          { path: '/register', element: <RegisterPage /> },
        ],
      },
      // Behind no guard: someone signed in on this device may still be
      // following a reset link from their mail, and GuestOnly would bounce
      // them away from it without a word.
      { path: '/forgot-password', element: <ForgotPasswordPage /> },
      { path: '/reset-password', element: <ResetPasswordPage /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
];
