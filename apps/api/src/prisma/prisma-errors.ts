import { Prisma } from '../generated/prisma/client.js';

/** Prisma error codes the services translate into domain errors. */
export const PrismaCode = {
  /** Unique constraint violated. */
  UniqueViolation: 'P2002',
  /** Foreign key constraint violated. */
  ForeignKeyViolation: 'P2003',
  /** Record to update/delete not found. */
  NotFound: 'P2025',
} as const;

type PrismaCode = (typeof PrismaCode)[keyof typeof PrismaCode];

export function isPrismaError(
  error: unknown,
  code: PrismaCode,
): error is Prisma.PrismaClientKnownRequestError {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === code
  );
}
