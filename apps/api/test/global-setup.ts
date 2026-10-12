import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { maintenanceUrl, testDatabaseUrl } from './utils/test-database.js';

/**
 * Once before all e2e files: the test database exists and has every
 * migration, applied the way a deploy applies them.
 */
export default async function setup(): Promise<void> {
  const url = testDatabaseUrl();
  const name = new URL(url).pathname.slice(1);

  const admin = new PrismaClient({
    adapter: new PrismaPg({ connectionString: maintenanceUrl(url) }),
  });
  try {
    const [found] = await admin.$queryRaw<{ exists: boolean }[]>`
      SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = ${name}) AS "exists"
    `;
    if (!found?.exists) {
      // An identifier, not a value: it cannot be a query parameter. The name
      // comes from our own config and is checked to be a plain one.
      if (!/^\w+$/.test(name))
        throw new Error(`Unexpected database name ${name}`);
      await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
    }
  } finally {
    await admin.$disconnect();
  }

  // The CLI's entry file run by this Node, no shell: the same on Windows
  // (where .bin holds .cmd scripts) and Linux.
  const prisma = createRequire(import.meta.url).resolve(
    'prisma/build/index.js',
  );
  try {
    execFileSync(process.execPath, [prisma, 'migrate', 'deploy'], {
      env: { ...process.env, DATABASE_URL: url },
      stdio: 'pipe',
    });
  } catch (error) {
    const { stdout, stderr } = error as { stdout?: Buffer; stderr?: Buffer };
    throw new Error(
      `prisma migrate deploy failed:\n${String(stdout ?? '')}${String(stderr ?? '')}`,
    );
  }
}
