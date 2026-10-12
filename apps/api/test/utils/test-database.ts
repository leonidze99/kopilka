import 'dotenv/config';

/**
 * e2e tests get a database of their own: the one in DATABASE_URL (from
 * apps/api/.env locally, from the workflow in CI) with "_test" appended.
 * Sharing the development database let tests move the clock of the
 * recurring runner over everybody's rules, and a running dev server's cron
 * act on the tests' data.
 */
export function testDatabaseUrl(): string {
  const base = process.env['DATABASE_URL'];
  if (!base) throw new Error('DATABASE_URL is not set (see apps/api/.env)');
  const url = new URL(base);
  const name = url.pathname.slice(1);
  if (!name.endsWith('_test')) url.pathname = `/${name}_test`;
  return url.toString();
}

/** The same server, its maintenance database: where CREATE DATABASE runs. */
export function maintenanceUrl(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  url.pathname = '/postgres';
  return url.toString();
}
