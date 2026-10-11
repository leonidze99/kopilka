import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Not env('DATABASE_URL'): it throws when the variable is missing,
    // and `prisma generate` must work without a database (CI, fresh clone).
    url: process.env['DATABASE_URL'],
  },
});
