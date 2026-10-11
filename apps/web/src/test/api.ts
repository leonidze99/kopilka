import type { ApiError, AuthResponse, ErrorCode } from '@kopilka/shared';
import { HttpResponse } from 'msw';
import { API_URL } from '@/shared/config/env';
import type { ApiPath } from '@/shared/api';

export const apiUrl = (path: ApiPath) => `${API_URL}${path}`;

export const USER = {
  id: '0199d0a4-5b6e-7c3d-8e9f-0a1b2c3d4e5f',
  email: 'user@example.com',
};

export const authResponse = (accessToken = 'access-1'): AuthResponse => ({
  accessToken,
  expiresIn: 900,
  user: USER,
});

export const apiError = (
  status: number,
  code: ErrorCode,
  message: string,
  details?: ApiError['details'],
) =>
  HttpResponse.json<ApiError>(
    { code, message, requestId: 'req-test', details },
    { status },
  );
