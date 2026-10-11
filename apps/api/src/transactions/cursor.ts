import { HttpStatus } from '@nestjs/common';
import { z } from 'zod';
import { AppException } from '../common/errors/app.exception.js';

/** Position after the last item of a page in ORDER BY occurred_at DESC, id DESC. */
export interface TransactionCursor {
  occurredAt: Date;
  id: string;
}

const cursorSchema = z.tuple([z.iso.datetime(), z.uuid()]);

/**
 * Opaque to clients (base64url of JSON): they pass it back as is, and the
 * format can change without breaking them.
 */
export function encodeCursor({ occurredAt, id }: TransactionCursor): string {
  return Buffer.from(JSON.stringify([occurredAt.toISOString(), id])).toString(
    'base64url',
  );
}

export function decodeCursor(cursor: string): TransactionCursor {
  try {
    const [occurredAt, id] = cursorSchema.parse(
      JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')),
    );
    return { occurredAt: new Date(occurredAt), id };
  } catch {
    throw new AppException(
      'BAD_REQUEST',
      'Invalid cursor',
      HttpStatus.BAD_REQUEST,
      [{ field: 'cursor', message: 'Некорректный курсор' }],
    );
  }
}
