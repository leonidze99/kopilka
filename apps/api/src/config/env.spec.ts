import { envSchema } from './env.js';

const DATABASE_URL = 'postgresql://kopilka:kopilka@localhost:5432/kopilka';
const JWT_ACCESS_SECRET = 'a'.repeat(32);
const base = { DATABASE_URL, JWT_ACCESS_SECRET };

/** Paths of the failed fields; an assertion on them, not just on success,
 * makes sure a negative test fails for the reason it is about. */
const failedFields = (env: Record<string, unknown>) =>
  envSchema.safeParse(env).error?.issues.map((i) => i.path.join('.'));

describe('envSchema', () => {
  it('applies defaults for optional variables', () => {
    expect(envSchema.parse(base)).toEqual({
      ...base,
      NODE_ENV: 'development',
      PORT: 3000,
      JWT_ACCESS_TTL_SECONDS: 900,
      REFRESH_TOKEN_TTL_DAYS: 30,
    });
  });

  it('coerces numbers from strings', () => {
    const env = envSchema.parse({
      ...base,
      PORT: '4000',
      JWT_ACCESS_TTL_SECONDS: '60',
    });
    expect(env.PORT).toBe(4000);
    expect(env.JWT_ACCESS_TTL_SECONDS).toBe(60);
  });

  it('requires DATABASE_URL and JWT_ACCESS_SECRET', () => {
    expect(failedFields({})).toEqual(['DATABASE_URL', 'JWT_ACCESS_SECRET']);
  });

  it('rejects a JWT secret shorter than 32 chars', () => {
    expect(
      failedFields({ ...base, JWT_ACCESS_SECRET: 'a'.repeat(31) }),
    ).toEqual(['JWT_ACCESS_SECRET']);
  });

  it.each(['mysql://localhost/db', 'not-a-url'])(
    'rejects non-postgres DATABASE_URL %s',
    (url) => {
      expect(failedFields({ ...base, DATABASE_URL: url })).toEqual([
        'DATABASE_URL',
      ]);
    },
  );

  it.each(['0', '70000', 'abc', '3000.5'])(
    'rejects invalid PORT %s',
    (port) => {
      expect(failedFields({ ...base, PORT: port })).toEqual(['PORT']);
    },
  );

  it('accepts a known LOG_LEVEL and rejects an unknown one', () => {
    expect(envSchema.parse({ ...base, LOG_LEVEL: 'warn' }).LOG_LEVEL).toBe(
      'warn',
    );
    expect(failedFields({ ...base, LOG_LEVEL: 'verbose' })).toEqual([
      'LOG_LEVEL',
    ]);
  });

  it('rejects unknown NODE_ENV', () => {
    expect(failedFields({ ...base, NODE_ENV: 'staging' })).toEqual([
      'NODE_ENV',
    ]);
  });
});
