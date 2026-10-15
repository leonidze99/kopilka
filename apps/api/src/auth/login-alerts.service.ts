import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { Env } from '../config/env.js';
import { Prisma } from '../generated/prisma/client.js';
import { escapeHtml } from '../mail/html.js';
import { type Mail, MailerService } from '../mail/mailer.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** A sign-in from a new device still to tell its user about. */
interface PendingDevice {
  id: string;
  email: string;
  time_zone: string;
  device: string;
  ip: string | null;
  created_at: Date;
}

function deviceMail(row: PendingDevice, appUrl: string): Mail {
  // In the user's own time: "15 октября, 10:42".
  const when = new Intl.DateTimeFormat('ru-RU', {
    timeZone: row.time_zone,
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(row.created_at);
  const where = row.ip ? `${row.device}, IP ${row.ip}` : row.device;
  const link = `${appUrl}/settings`;
  const subject = 'Вход в Копилку с нового устройства';
  return {
    to: row.email,
    subject,
    text: [
      `${subject}: ${where}, ${when}.`,
      '',
      'Если это были вы — ничего делать не нужно.',
      `Если нет — смените пароль: это завершит все остальные сеансы. ${link}`,
      '',
      'Чтобы не получать такие письма, выключите их в настройках Копилки.',
    ].join('\n'),
    html: `<p>${subject}: <strong>${escapeHtml(where)}</strong>, ${when}.</p>
<p>Если это были вы — ничего делать не нужно.</p>
<p>Если нет — <a href="${link}">смените пароль</a>: это завершит все остальные сеансы.</p>
<p>Чтобы не получать такие письма, выключите их в настройках.</p>`,
  };
}

/**
 * Mails a user about a sign-in from a device not seen before. Sent right
 * after the sign-in (kick), without the sign-in waiting for it or failing
 * with it; the job picks up whatever did not go out.
 */
@Injectable()
export class LoginAlertsService {
  private readonly logger = new Logger(LoginAlertsService.name);
  private readonly jobsEnabled: boolean;
  private readonly appUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
    config: ConfigService<Env, true>,
  ) {
    this.jobsEnabled = config.get('JOBS_ENABLED', { infer: true });
    this.appUrl = config.get('APP_URL', { infer: true });
  }

  @Cron(CronExpression.EVERY_MINUTE, { name: 'login-alerts' })
  async tick(): Promise<void> {
    if (!this.jobsEnabled) return;
    try {
      await this.run();
    } catch (error) {
      this.logger.error(error, 'Login alerts failed');
    }
  }

  /**
   * In the background, now: the letter should come while the user still
   * remembers signing in. Off with the jobs (tests call run() themselves).
   */
  kick(): void {
    if (this.jobsEnabled) void this.tick();
  }

  /**
   * Returns how many letters went out; `scope.userId` keeps a test to its
   * own rows. Each letter claims its row (notified_at from NULL) and is
   * sent in the same transaction: a silent SMTP server is retried, two
   * instances do not mail twice.
   */
  async run(scope: { userId?: string } = {}): Promise<number> {
    const user = scope.userId
      ? Prisma.sql`AND d.user_id = ${scope.userId}::uuid`
      : Prisma.empty;

    // With the letters off there is nothing to tell, now or later.
    await this.prisma.$executeRaw`
      UPDATE known_devices d SET notified_at = now()
      FROM users u
      WHERE u.id = d.user_id AND NOT u.login_alerts
        AND d.notified_at IS NULL ${user}
    `;

    const pending = await this.prisma.$queryRaw<PendingDevice[]>`
      SELECT d.id, u.email, u.time_zone, d.device, d.ip, d.created_at
      FROM known_devices d
      JOIN users u ON u.id = d.user_id
      WHERE d.notified_at IS NULL ${user}
      ORDER BY d.created_at
    `;

    let sent = 0;
    for (const row of pending) {
      try {
        const mailed = await this.prisma.$transaction(async (tx) => {
          const { count } = await tx.knownDevice.updateMany({
            where: { id: row.id, notifiedAt: null },
            data: { notifiedAt: new Date() },
          });
          if (count === 0) return false;
          await this.mailer.send(deviceMail(row, this.appUrl));
          return true;
        });
        if (mailed) sent++;
      } catch (error) {
        this.logger.error({
          msg: 'Login alert not sent',
          deviceId: row.id,
          err: error,
        });
      }
    }
    if (sent > 0) this.logger.log({ sent }, 'Login alerts sent');
    return sent;
  }
}
