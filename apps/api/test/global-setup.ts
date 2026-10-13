import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { startTestDatabase } from './utils/test-database.js';

/**
 * Once before all e2e files: a database to run against, with every migration
 * applied the way a deploy applies them.
 *
 * The URL is put into the environment rather than into the Vitest config,
 * which is read before the container exists; the test workers are forked
 * after this and inherit it. dotenv does not override what is already set,
 * so apps/api/.env cannot point the tests at the development database.
 */
export default async function setup(): Promise<() => Promise<void>> {
  const database = await startTestDatabase();
  process.env['DATABASE_URL'] = database.url;

  // The CLI's entry file run by this Node, no shell: the same on Windows
  // (where .bin holds .cmd scripts) and Linux.
  const prisma = createRequire(import.meta.url).resolve(
    'prisma/build/index.js',
  );
  try {
    execFileSync(process.execPath, [prisma, 'migrate', 'deploy'], {
      env: { ...process.env, DATABASE_URL: database.url },
      stdio: 'pipe',
    });
  } catch (error) {
    await database.stop();
    const { stdout, stderr } = error as { stdout?: Buffer; stderr?: Buffer };
    throw new Error(
      `prisma migrate deploy failed:\n${String(stdout ?? '')}${String(stderr ?? '')}`,
    );
  }

  return () => database.stop();
}
