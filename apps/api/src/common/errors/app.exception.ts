import { HttpException, HttpStatus } from '@nestjs/common';
import type { ErrorCode, ErrorDetail } from '@kopilka/shared';

/**
 * Error with a machine-readable code from the shared contract.
 * Throw it from services when the client needs to tell this failure apart
 * from others (e.g. CONFLICT with field "email" on registration).
 */
export class AppException extends HttpException {
  constructor(
    readonly code: ErrorCode,
    message: string,
    status: HttpStatus,
    readonly details?: ErrorDetail[],
  ) {
    super(message, status);
  }
}
