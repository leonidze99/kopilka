import { Navigate, type RouteObject } from 'react-router';
import { HomePage } from '@/pages/home';
import { LoginPage } from '@/pages/login';
import { RegisterPage } from '@/pages/register';
import { GuestOnly, RequireAuth } from './guards';

export const routes: RouteObject[] = [
  {
    element: <RequireAuth />,
    children: [{ path: '/', element: <HomePage /> }],
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
