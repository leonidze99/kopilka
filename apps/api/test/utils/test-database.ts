import 'dotenv/config';
import { PostgreSqlContainer } from '@testcontainers/postgresql';

/** The Postgres the e2e suite runs against, and how to let it go. */
export interface TestDatabase {
  url: string;
  stop: () => Promise<void>;
}

// The same server version as development and production run.
const IMAGE = 'postgres:18-alpine';

/**
 * A database for the e2e run.
 *
 * By default a Postgres container of its own (Testcontainers), thrown away
 * afterwards: the suite needs no local server, cannot inherit leftovers from
 * an earlier run, and cannot touch development data — a test moving the
 * recurring runner's clock months ahead used to make payments on the demo
 * user's rules, and a dev server's cron used to act on the tests' rows.
 *
 * E2E_DATABASE_URL points the run at an existing database instead (for an
 * environment where starting containers is not an option). That database is
 * migrated and written to, so it must not be one anybody cares about.
 */
export async function startTestDatabase(): Promise<TestDatabase> {
  const existing = process.env['E2E_DATABASE_URL'];
  if (existing) return { url: existing, stop: () => Promise.resolve() };

  const container = await new PostgreSqlContainer(IMAGE)
    .withDatabase('kopilka_test')
    // Collation decides what lower() does to Cyrillic, which comment search
    // depends on; the C locale would leave "Пятёрочка" as it is.
    .withEnvironment({
      LANG: 'C.UTF-8',
      POSTGRES_INITDB_ARGS: '--locale=C.UTF-8',
    })
    .start();

  return {
    url: container.getConnectionUri(),
    stop: async () => {
      await container.stop();
    },
  };
}
