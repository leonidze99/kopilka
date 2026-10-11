import {
  HttpStatus,
  StandardSchemaValidationPipe,
  type StandardSchemaValidationPipeOptions,
} from '@nestjs/common';
import { AppException } from './app.exception.js';

type Issue = Parameters<
  NonNullable<StandardSchemaValidationPipeOptions['exceptionFactory']>
>[0][number];

function toField(path: Issue['path']): string | undefined {
  if (!path?.length) return undefined;
  return path
    .map((segment) =>
      typeof segment === 'object' ? String(segment.key) : String(segment),
    )
    .join('.');
}

/**
 * Validates params decorated with a schema, e.g. `@Body({ schema })`,
 * and reports every issue in the shared error format.
 */
export function createValidationPipe() {
  return new StandardSchemaValidationPipe({
    exceptionFactory: (issues) =>
      new AppException(
        'VALIDATION_FAILED',
        'Validation failed',
        HttpStatus.BAD_REQUEST,
        issues.map((issue) => ({
          field: toField(issue.path),
          message: issue.message,
        })),
      ),
  });
}
