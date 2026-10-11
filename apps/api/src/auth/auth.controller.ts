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
  type AuthResponse,
  type LoginDto,
  type RegisterDto,
  type User,
  loginSchema,
  registerSchema,
} from '@kopilka/shared';
import type { CookieOptions, Request, Response } from 'express';
import type { Env } from '../config/env.js';
import { AuthService, type Session } from './auth.service.js';
import { type AuthUser, CurrentUser } from './current-user.decorator.js';
import { Public } from './public.decorator.js';

export const REFRESH_COOKIE = 'refresh_token';

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
      // Sent only to /auth/*, not with every API call.
      path: '/auth',
    };
  }

  @Public()
  @Post('register')
  async register(
    @Body({ schema: registerSchema }) dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    return this.respond(res, await this.auth.register(dto));
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body({ schema: loginSchema }) dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    return this.respond(res, await this.auth.login(dto));
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
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
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout(this.cookieOf(req));
    res.clearCookie(REFRESH_COOKIE, this.cookieOptions);
  }

  @Get('me')
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
