import { PrismaPg } from '@prisma/adapter-pg';
import { seedDemo } from '../demo/seed-demo.js';
import { PrismaClient } from '../generated/prisma/client.js';

/**
 * `pnpm db:seed`: (re)creates the demo account. Runs from dist like the
 * OpenAPI script. Reads DATABASE_URL from the environment or apps/api/.env
 * (Node's own loader: dotenv is a dev dependency, absent from the image).
 *
 * In production it refuses unless asked with --production: it deletes and
 * recreates the demo user, and anything a visitor did with it.
 */
try {
  process.loadEnvFile();
} catch {
  // No .env: the environment has the variables (CI, the image).
}

const url = process.env['DATABASE_URL'];
if (!url) {
  console.error('DATABASE_URL is not set (see apps/api/.env)');
  process.exit(1);
}
if (
  process.env['NODE_ENV'] === 'production' &&
  !process.argv.includes('--production')
) {
  console.error(
    'NODE_ENV=production: run with --production to reset the demo account there',
  );
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url }),
});
try {
  const result = await seedDemo(prisma);
  console.log(
    [
      `Demo account ready: ${result.transactions} transactions.`,
      `  email:    ${result.email}`,
      `  password: ${result.password}`,
    ].join('\n'),
  );
} finally {
  await prisma.$disconnect();
}
