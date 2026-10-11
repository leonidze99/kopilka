import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiSecurity } from '@nestjs/swagger';

export const IS_PUBLIC = 'isPublic';

/**
 * Opts a route (or a whole controller) out of the global JwtAuthGuard.
 * Everything else requires a valid access token by default, so a new
 * endpoint cannot be left unprotected by accident.
 *
 * Also clears the bearer requirement in the OpenAPI document
 * (`security: [{}]`), so the docs cannot drift from the guard.
 */
export const Public = () =>
  applyDecorators(SetMetadata(IS_PUBLIC, true), ApiSecurity({}));
