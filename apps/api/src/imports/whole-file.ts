/**
 * Options of an interactive transaction over a whole statement: up to
 * 50 000 rows. Prisma cuts a transaction off after 5 s by default, which a
 * large file runs past, and so does an ordinary one on a busy server (the
 * e2e suite saw 6.8 s for 2500 rows with every other suite running): the
 * work is then rolled back half way and the request, or the background job,
 * fails. A minute is far beyond any real file, and still ends a hung one.
 * `maxWait` is for a connection from the pool.
 */
export const WHOLE_FILE = { timeout: 60_000, maxWait: 10_000 } as const;
