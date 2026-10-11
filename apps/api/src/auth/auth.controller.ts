import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { minutes, Throttle } from '@nestjs/throttler';
import {
  type AuthResponse,
  type LoginDto,
  type RegisterDto,
  type User,
  authResponseSchema,
  loginSchema,
  registerSchema,
  userSchema,
} from '@kopilka/shared';
import type { CookieOptions, Request, Response } from 'express';
import { API_PREFIX } from '../common/http/api-prefix.js';
import { ApiErrorResponses } from '../common/openapi/api-error-responses.decorator.js';
import type { Env } from '../config/env.js';
import { AuthService, type Session } from './auth.service.js';
import { type AuthUser, CurrentUser } from './current-user.decorator.js';
import { Public } from './public.decorator.js';

export const REFRESH_COOKIE = 'refresh_token';

// Sent only to the auth routes, not with every API call.
const REFRESH_COOKIE_PATH = `/${API_PREFIX}/auth`;

// Guessing passwords and mass sign-ups: far below the global limit.
// Counted per IP and per route, so login and register have separate budgets.
const AUTH_THROTTLE = { default: { limit: 10, ttl: minutes(1) } };

const SETS_REFRESH_COOKIE = `Also sets the \`refresh_token\` cookie (httpOnly, SameSite=Strict, Path=${REFRESH_COOKIE_PATH}).`;

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly cookieOptions: CookieOptions;

  constructor(
    private readonly auth: AuthService,
    config: ConfigService<Env, true>,
  ) {
    this.cookieOptions = {
      // Not readable from JavaScript, so an XSS cannot steal it.
      httpOnly: true,
      // Browsers treat http://localhost as secure, but test clients do not.
      secure: config.get('NODE_ENV', { infer: true }) === 'production',
      // Not sent on cross-site requests: CSRF cannot trigger a refresh.
      sameSite: 'strict',
      path: REFRESH_COOKIE_PATH,
    };
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('register')
  @ApiOperation({ summary: 'Create an account and sign in' })
  @ApiCreatedResponse({
    description: SETS_REFRESH_COOKIE,
    standardSchema: authResponseSchema,
  })
  @ApiErrorResponses(400, 409, 429)
  async register(
    @Body({ schema: registerSchema }) dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    return this.respond(res, await this.auth.register(dto));
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in with email and password' })
  @ApiOkResponse({
    description: SETS_REFRESH_COOKIE,
    standardSchema: authResponseSchema,
  })
  @ApiErrorResponses(400, 401, 429)
  async login(
    @Body({ schema: loginSchema }) dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    return this.respond(res, await this.auth.login(dto));
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Exchange the refresh_token cookie for new tokens',
    description:
      'Rotates the refresh token. Reusing an already rotated token revokes the whole session.',
  })
  @ApiOkResponse({
    description: SETS_REFRESH_COOKIE,
    standardSchema: authResponseSchema,
  })
  @ApiErrorResponses(401)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    try {
      return this.respond(res, await this.auth.refresh(this.cookieOf(req)));
    } catch (error) {
      // Make the browser drop a cookie that will never work again.
      res.clearCookie(REFRESH_COOKIE, this.cookieOptions);
      throw error;
    }
  }

  // Public: logging out must work even after the access token has expired.
  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'End the session of the refresh_token cookie' })
  @ApiNoContentResponse({ description: 'Clears the refresh_token cookie.' })
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout(this.cookieOf(req));
    res.clearCookie(REFRESH_COOKIE, this.cookieOptions);
  }

  @Get('me')
  @ApiOperation({ summary: 'The signed-in user' })
  @ApiOkResponse({ standardSchema: userSchema })
  @ApiErrorResponses(401)
  me(@CurrentUser() user: AuthUser): Promise<User> {
    return this.auth.me(user.id);
  }

  private cookieOf(req: Request): string | undefined {
    const value: unknown = req.cookies?.[REFRESH_COOKIE];
    return typeof value === 'string' ? value : undefined;
  }

  private respond(res: Response, { auth, refreshToken }: Session) {
    res.cookie(REFRESH_COOKIE, refreshToken.token, {
      ...this.cookieOptions,
      expires: refreshToken.expiresAt,
    });
    return auth;
  }
}
