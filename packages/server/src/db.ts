import { Prisma, PrismaClient } from '@prisma/client';

// Only warnings: query errors (e.g. expected unique violations) are handled or logged by our own code.
export const prisma = new PrismaClient({ log: ['warn'] });

/** A Prisma client inside an interactive transaction. */
export type Tx = Prisma.TransactionClient;

/** Postgres unique-violation (SQLSTATE 23505) as reported by Prisma. */
export function isUniqueViolation(err: unknown): err is Prisma.PrismaClientKnownRequestError {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}
