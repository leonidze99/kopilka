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
import { SessionsService } from './sessions.service.js';

const unauthorized = (message: string) =>
  new AppException('UNAUTHORIZED', message, HttpStatus.UNAUTHORIZED);

/**
 * Global guard: every route requires `Authorization: Bearer <access token>`
 * unless marked with @Public(). The signature and expiry are checked
 * without the database; then one primary-key lookup confirms the session
 * (sid) has not ended. Without it a signed-out device, or one that had the
 * old password, would keep access until its token expired.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    private readonly sessions: SessionsService,
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
      throw unauthorized('Missing access token');
    }

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);
    } catch {
      throw unauthorized('Invalid or expired access token');
    }
    // Tokens from before sessions had ids carry no sid: a 401 makes the
    // client refresh once and get one that does.
    if (
      !payload.sid ||
      !(await this.sessions.isActive(payload.sid, payload.sub))
    ) {
      throw unauthorized('Session has ended');
    }
    request.user = { id: payload.sub, sessionId: payload.sid };
    return true;
  }
}
