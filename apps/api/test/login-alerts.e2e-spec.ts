import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { LoginAlertsService } from '../src/auth/login-alerts.service.js';
import { MailerService } from '../src/mail/mailer.service.js';
import { TEST_PASSWORD, type TestUser, testUsers } from './utils/auth.js';
import { createTestApp } from './utils/create-test-app.js';
import { FakeMailer } from './utils/fake-mailer.js';

const CHROME_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

describe('Login alerts (e2e)', () => {
  let app: NestExpressApplication;
  let users: ReturnType<typeof testUsers>;
  let alerts: LoginAlertsService;
  let mailer: FakeMailer;

  beforeAll(async () => {
    mailer = new FakeMailer();
    app = await createTestApp({
      overrides: [{ provide: MailerService, useValue: mailer }],
    });
    users = testUsers(app);
    alerts = app.get(LoginAlertsService);
  });

  afterAll(async () => {
    await users.cleanup();
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  /** Signs in from a browser that sends `cookie`, if any; returns its device_id. */
  async function signIn(user: TestUser, cookie?: string) {
    const req = http()
      .post('/api/auth/login')
      .set('User-Agent', CHROME_WINDOWS)
      .send({ email: user.email, password: TEST_PASSWORD });
    if (cookie) req.set('Cookie', cookie);
    const res = await req.expect(200);
    const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
    const device = cookies.find((c) => c.startsWith('device_id='));
    expect(device).toMatch(/HttpOnly/);
    return device!.split(';')[0]!;
  }

  /** Only this user's devices: the suites share one database. */
  const run = (user: TestUser) => alerts.run({ userId: user.id });

  it('mails about a sign-in from a browser it has not seen', async () => {
    const user = await users.signUp();

    await signIn(user);

    expect(await run(user)).toBe(1);
    const [mail] = mailer.to(user.email);
    expect(mail?.subject).toBe('Вход в Копилку с нового устройства');
    expect(mail?.text).toContain('Chrome, Windows, IP');
    expect(mail?.text).toContain('/settings');
    // The same sign-in is not news a minute later.
    expect(await run(user)).toBe(0);
  });

  it('stays quiet on the browser that registered and on one it knows', async () => {
    const user = await users.signUp();

    const device = await signIn(user, user.device);
    expect(device).toBe(user.device);
    await signIn(user, device);

    expect(await run(user)).toBe(0);
    expect(mailer.to(user.email)).toHaveLength(0);
  });

  it('replaces a cookie that is not its own, and counts it as new', async () => {
    const user = await users.signUp();

    const device = await signIn(user, 'device_id=whatever');

    expect(device).not.toBe('device_id=whatever');
    expect(await run(user)).toBe(1);
  });

  it('knows a shared browser for each user on its own', async () => {
    const alice = await users.signUp();
    const bob = await users.signUp();

    // Bob signs in on Alice's computer: new to him, not to her.
    await signIn(bob, alice.device);
    await signIn(alice, alice.device);

    expect(await run(bob)).toBe(1);
    expect(await run(alice)).toBe(0);
  });

  it('lets sign-ins go while the letters are off, and does not mail them later', async () => {
    const user = await users.signUp();
    const toggle = (loginAlerts: boolean) =>
      http()
        .put('/api/auth/notifications')
        .set('Authorization', user.auth)
        .send({ loginAlerts })
        .expect(200);
    const { body } = await toggle(false);
    expect(body).toMatchObject({ loginAlerts: false });

    await signIn(user);
    expect(await run(user)).toBe(0);
    await toggle(true);
    expect(await run(user)).toBe(0);
    expect(mailer.to(user.email)).toHaveLength(0);
  });
});
