import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { AppException } from '../common/errors/app.exception.js';
import type { AuthenticatedRequest } from './current-user.decorator.js';
import type { AccessTokenPayload } from './auth.service.js';
import { IS_PUBLIC } from './public.decorator.js';

/**
 * Global guard: every route requires `Authorization: Bearer <access token>`
 * unless marked with @Public(). The token is verified statelessly, without
 * a database round trip; that is why access tokens are short-lived.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token) {
      throw new AppException(
        'UNAUTHORIZED',
        'Missing access token',
        HttpStatus.UNAUTHORIZED,
      );
    }

    try {
      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);
      request.user = { id: payload.sub };
    } catch {
      throw new AppException(
        'UNAUTHORIZED',
        'Invalid or expired access token',
        HttpStatus.UNAUTHORIZED,
      );
    }
    return true;
  }
}
