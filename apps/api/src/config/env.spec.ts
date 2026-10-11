import { envSchema } from './env.js';

const DATABASE_URL = 'postgresql://kopilka:kopilka@localhost:5432/kopilka';

describe('envSchema', () => {
  it('applies defaults for optional variables', () => {
    expect(envSchema.parse({ DATABASE_URL })).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      DATABASE_URL,
    });
  });

  it('coerces PORT from string to number', () => {
    expect(envSchema.parse({ DATABASE_URL, PORT: '4000' }).PORT).toBe(4000);
  });

  it('requires DATABASE_URL', () => {
    const result = envSchema.safeParse({});
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.path.join('.'))).toEqual([
      'DATABASE_URL',
    ]);
  });

  it.each(['mysql://localhost/db', 'not-a-url'])(
    'rejects non-postgres DATABASE_URL %s',
    (url) => {
      expect(envSchema.safeParse({ DATABASE_URL: url }).success).toBe(false);
    },
  );

  it.each(['0', '70000', 'abc', '3000.5'])(
    'rejects invalid PORT %s',
    (port) => {
      expect(envSchema.safeParse({ DATABASE_URL, PORT: port }).success).toBe(
        false,
      );
    },
  );

  it('accepts a known LOG_LEVEL and rejects an unknown one', () => {
    expect(envSchema.parse({ DATABASE_URL, LOG_LEVEL: 'warn' }).LOG_LEVEL).toBe(
      'warn',
    );
    expect(
      envSchema.safeParse({ DATABASE_URL, LOG_LEVEL: 'verbose' }).success,
    ).toBe(false);
  });

  it('rejects unknown NODE_ENV', () => {
    expect(
      envSchema.safeParse({ DATABASE_URL, NODE_ENV: 'staging' }).success,
    ).toBe(false);
  });
});
