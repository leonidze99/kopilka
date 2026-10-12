import { Navigate, type RouteObject } from 'react-router';
import { AccountsPage } from '@/pages/accounts';
import { CategoriesPage } from '@/pages/categories';
import { LoginPage } from '@/pages/login';
import { RecurringPage } from '@/pages/recurring';
import { RegisterPage } from '@/pages/register';
import { TransactionsPage } from '@/pages/transactions';
import { AppLayout } from '../layouts/AppLayout';
import { GuestOnly, RequireAuth } from './guards';

export const routes: RouteObject[] = [
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
  { path: '*', element: <Navigate to="/" replace /> },
];
