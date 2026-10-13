import { Navigate, type RouteObject } from 'react-router';
import { AccountsPage } from '@/pages/accounts';
import { CategoriesPage } from '@/pages/categories';
import { ForgotPasswordPage } from '@/pages/forgot-password';
import { ImportDetailsPage, ImportPage } from '@/pages/import';
import { LoginPage } from '@/pages/login';
import { RecurringPage } from '@/pages/recurring';
import { RegisterPage } from '@/pages/register';
import { ResetPasswordPage } from '@/pages/reset-password';
import { SettingsPage } from '@/pages/settings';
import { TransactionsPage } from '@/pages/transactions';
import { AppLayout } from '../layouts/AppLayout';
import { RootLayout } from '../layouts/RootLayout';
import { GuestOnly, RequireAuth } from './guards';

export const routes: RouteObject[] = [
  {
    // Holds the toaster, so a toast raised before a redirect is still shown
    // on the page it lands on, even in another layout.
    element: <RootLayout />,
    children: [
      {
        element: <RequireAuth />,
        children: [
          {
            element: <AppLayout />,
            children: [
              { path: '/', element: <TransactionsPage /> },
              { path: '/accounts', element: <AccountsPage /> },
              { path: '/categories', element: <CategoriesPage /> },
              { path: '/recurring', element: <RecurringPage /> },
              { path: '/import', element: <ImportPage /> },
              { path: '/import/:id', element: <ImportDetailsPage /> },
              { path: '/settings', element: <SettingsPage /> },
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
