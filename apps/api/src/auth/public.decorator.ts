import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'isPublic';

/**
 * Opts a route (or a whole controller) out of the global JwtAuthGuard.
 * Everything else requires a valid access token by default, so a new
 * endpoint cannot be left unprotected by accident.
 */
export const Public = () => SetMetadata(IS_PUBLIC, true);
