import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { Env } from '../config/env.js';
import { Prisma } from '../generated/prisma/client.js';
import { escapeHtml } from '../mail/html.js';
import { type Mail, MailerService } from '../mail/mailer.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** A skipped payment still to tell its user about. */
interface PendingSkip {
  id: string;
  user_id: string;
  email: string;
  on_date: Date;
  reason: string;
  comment: string | null;
  category: string | null;
  to_account: string | null;
}

const dayFormat = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});

const plural = new Intl.PluralRules('ru-RU');

/** "3 регулярных платежа". */
function payments(count: number): string {
  const form = plural.select(count);
  const word =
    form === 'one'
      ? 'регулярный платёж'
      : form === 'few'
        ? 'регулярных платежа'
        : 'регулярных платежей';
  return `${count} ${word}`;
}

/** How the user knows the rule: its comment, its category, or the transfer. */
function ruleName(skip: PendingSkip): string {
  if (skip.comment) return skip.comment;
  if (skip.category) return skip.category;
  if (skip.to_account) return `Перевод на «${skip.to_account}»`;
  return 'Регулярный платёж';
}

/** One letter with every skip of a user since the last one, oldest first. */
function skipsMail(skips: PendingSkip[], appUrl: string): Mail {
  const link = `${appUrl}/recurring`;
  const subject =
    skips.length === 1
      ? `Не прошёл платёж «${ruleName(skips[0]!)}»`
      : `Не прошли ${payments(skips.length)}`;
  const line = (skip: PendingSkip) =>
    `${dayFormat.format(skip.on_date)} — «${ruleName(skip)}»: ${skip.reason}.`;
  return {
    to: skips[0]!.email,
    subject,
    text: [
      `${subject}.`,
      '',
      ...skips.map(line),
      '',
      'Эти даты пропущены: правила продолжат со следующей. Если платёж всё же был — внесите его вручную.',
      '',
      `Регулярные платежи: ${link}`,
      '',
      'Чтобы не получать такие письма, выключите их в настройках Копилки.',
    ].join('\n'),
    html: `<p>${escapeHtml(subject)}.</p>
<ul>${skips.map((skip) => `<li>${escapeHtml(line(skip))}</li>`).join('')}</ul>
<p>Эти даты пропущены: правила продолжат со следующей. Если платёж всё же был — внесите его вручную.</p>
<p><a href="${link}">Регулярные платежи в Копилке</a></p>
<p>Чтобы не получать такие письма, выключите их в настройках.</p>`,
  };
}

/**
 * Tells users about recurring payments the runner had to skip (no money on
 * an account that must not go negative, no exchange rate). A job rather
 * than mail from the runner: a payment must not wait for SMTP, and several
 * skips in a row (a rule catching up) make one letter, not several.
 */
@Injectable()
export class RecurringAlertsService {
  private readonly logger = new Logger(RecurringAlertsService.name);
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

  // The runner works every minute; a skip is told within ten.
  @Cron(CronExpression.EVERY_10_MINUTES, { name: 'recurring-alerts' })
  async tick(): Promise<void> {
    if (!this.jobsEnabled) return;
    try {
      await this.run();
    } catch (error) {
      this.logger.error(error, 'Recurring alerts failed');
    }
  }

  /**
   * Returns how many letters went out. `scope.userId`: only that user's
   * skips, for tests (suites share one database), as the other jobs do.
   *
   * Each letter claims its rows first (compare-and-set: notified_at from
   * NULL) and is sent in the same transaction: a failing SMTP server rolls
   * the claim back and the next run tries again; two instances at once
   * mail a skip once — the second finds the rows claimed.
   */
  async run(scope: { userId?: string } = {}): Promise<number> {
    const user = scope.userId
      ? Prisma.sql`AND s.user_id = ${scope.userId}::uuid`
      : Prisma.empty;

    // With the letters off, skips are let go: turning them on later must
    // not bring a pile of old news.
    await this.prisma.$executeRaw`
      UPDATE recurring_skips s SET notified_at = now()
      FROM users u
      WHERE u.id = s.user_id AND NOT u.recurring_alerts
        AND s.notified_at IS NULL ${user}
    `;

    const pending = await this.prisma.$queryRaw<PendingSkip[]>`
      SELECT s.id, s.user_id, u.email, s.on_date, s.reason,
             r.comment, c.name AS category, ta.name AS to_account
      FROM recurring_skips s
      JOIN users u ON u.id = s.user_id
      JOIN recurring_rules r ON r.id = s.rule_id
      LEFT JOIN categories c ON c.id = r.category_id
      LEFT JOIN accounts ta ON ta.id = r.to_account_id
      WHERE s.notified_at IS NULL AND u.recurring_alerts ${user}
      ORDER BY s.user_id, s.on_date, s.created_at
    `;

    const byUser = new Map<string, PendingSkip[]>();
    for (const skip of pending) {
      byUser.set(skip.user_id, [...(byUser.get(skip.user_id) ?? []), skip]);
    }

    let sent = 0;
    for (const [userId, skips] of byUser) {
      try {
        const mailed = await this.prisma.$transaction(async (tx) => {
          const claimed = await tx.$queryRaw<{ id: string }[]>`
            UPDATE recurring_skips SET notified_at = now()
            WHERE id = ANY(${skips.map((skip) => skip.id)}::uuid[])
              AND notified_at IS NULL
            RETURNING id
          `;
          const ids = new Set(claimed.map((row) => row.id));
          const mine = skips.filter((skip) => ids.has(skip.id));
          if (mine.length === 0) return false;
          await this.mailer.send(skipsMail(mine, this.appUrl));
          return true;
        });
        if (mailed) sent++;
      } catch (error) {
        this.logger.error({
          msg: 'Recurring alert not sent',
          userId,
          err: error,
        });
      }
    }

    if (sent > 0) this.logger.log({ sent }, 'Recurring alerts sent');
    return sent;
  }
}
