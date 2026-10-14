import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { Tx } from '../accounts/accounts.service.js';
import type { Env } from '../config/env.js';
import { Prisma } from '../generated/prisma/client.js';
import { type Mail, MailerService } from '../mail/mailer.service.js';
import { isPrismaError, PrismaCode } from '../prisma/prisma-errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { categorySpent, tagSpent } from '../transactions/parts.js';

/** A budget of the current month whose spending has passed its limit. */
interface Overspent {
  user_id: string;
  email: string;
  category_id: string;
  category: string;
  month: Date;
  spent: Prisma.Decimal;
  limit: Prisma.Decimal;
}

/** A tag whose spending, over all time, has passed its budget. */
interface OverspentTag {
  user_id: string;
  email: string;
  tag_id: string;
  tag: string;
  spent: Prisma.Decimal;
  limit: Prisma.Decimal;
}

/** One letter to send, with the row that records it. */
interface Alert {
  write: (tx: Tx) => Promise<unknown>;
  mail: Mail;
  /** Who and what, for the log if it fails. */
  about: Record<string, string>;
}

/** Names are the user's own text: into HTML only escaped. */
const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"]/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]!,
  );

const money = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  minimumFractionDigits: 2,
});

const monthName = new Intl.DateTimeFormat('ru-RU', {
  month: 'long',
  timeZone: 'UTC',
});

function alertMail(row: Overspent, appUrl: string): Mail {
  const month = monthName.format(row.month);
  const spent = money.format(Number(row.spent));
  const limit = money.format(Number(row.limit));
  const over = money.format(Number(row.spent) - Number(row.limit));
  const subject = `Бюджет «${row.category}» на ${month} превышен`;
  return {
    to: row.email,
    subject,
    text: [
      `${subject}.`,
      '',
      `Потрачено ${spent} из ${limit} — на ${over} больше.`,
      '',
      `Посмотреть: ${appUrl}`,
      '',
      'Чтобы не получать такие письма, выключите их в настройках Копилки.',
    ].join('\n'),
    html: `<p>Бюджет «${escapeHtml(row.category)}» на ${month} превышен.</p>
<p>Потрачено <strong>${spent}</strong> из ${limit} — на ${over} больше.</p>
<p><a href="${appUrl}">Посмотреть в Копилке</a></p>
<p>Чтобы не получать такие письма, выключите их в настройках.</p>`,
  };
}

/**
 * A tag budget has no months: the letter is about the whole of it, and
 * links to the tag's transactions over all time.
 */
function tagAlertMail(row: OverspentTag, appUrl: string): Mail {
  const spent = money.format(Number(row.spent));
  const limit = money.format(Number(row.limit));
  const over = money.format(Number(row.spent) - Number(row.limit));
  const link = `${appUrl}/?tag=${row.tag_id}`;
  const subject = `Бюджет тега «${row.tag}» превышен`;
  return {
    to: row.email,
    subject,
    text: [
      `${subject}.`,
      '',
      `Потрачено ${spent} из ${limit} — на ${over} больше.`,
      '',
      `Операции с тегом: ${link}`,
      '',
      'Чтобы не получать такие письма, выключите их в настройках Копилки.',
    ].join('\n'),
    html: `<p>Бюджет тега «${escapeHtml(row.tag)}» превышен.</p>
<p>Потрачено <strong>${spent}</strong> из ${limit} — на ${over} больше.</p>
<p><a href="${link}">Операции с тегом в Копилке</a></p>
<p>Чтобы не получать такие письма, выключите их в настройках.</p>`,
  };
}

/**
 * Mails a user once per category and month when the month's spending passes
 * the budget, and once per tag and limit when a tag's spending passes its
 * budget (raising the limit and passing it again is a new letter). A job
 * rather than a check on every write: ten purchases in a
 * row would be ten letters, and a write should not wait for an SMTP server.
 */
@Injectable()
export class BudgetAlertsService {
  private readonly logger = new Logger(BudgetAlertsService.name);
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

  @Cron(CronExpression.EVERY_HOUR, { name: 'budget-alerts' })
  async tick(): Promise<void> {
    if (!this.jobsEnabled) return;
    try {
      await this.run(new Date());
    } catch (error) {
      this.logger.error(error, 'Budget alerts failed');
    }
  }

  /**
   * `now` is a parameter: tests move the clock. `scope.userId` keeps a test
   * to its own rows, as the other jobs do — suites share one database.
   *
   * The row is written and the letter sent in one transaction: a failing
   * SMTP server rolls the row back and the next hour tries again, rather
   * than marking an alert nobody received. The unique index on
   * (category_id, month) is what makes a second letter impossible, even
   * with two instances running the job at the same moment.
   */
  async run(now: Date, scope: { userId?: string } = {}): Promise<number> {
    const categories = await this.overspent(now, scope.userId);
    const tags = await this.overspentTags(scope.userId);
    const alerts: Alert[] = [
      ...categories.map((row) => ({
        write: (tx: Tx) =>
          tx.budgetAlert.create({
            data: {
              userId: row.user_id,
              categoryId: row.category_id,
              month: row.month,
              spent: row.spent,
              limit: row.limit,
            },
          }),
        mail: alertMail(row, this.appUrl),
        about: { userId: row.user_id, categoryId: row.category_id },
      })),
      // The unique index on (tag_id, limit) does the same for tags.
      ...tags.map((row) => ({
        write: (tx: Tx) =>
          tx.tagBudgetAlert.create({
            data: {
              userId: row.user_id,
              tagId: row.tag_id,
              spent: row.spent,
              limit: row.limit,
            },
          }),
        mail: tagAlertMail(row, this.appUrl),
        about: { userId: row.user_id, tagId: row.tag_id },
      })),
    ];
    let sent = 0;

    for (const alert of alerts) {
      try {
        await this.prisma.$transaction(async (tx) => {
          await alert.write(tx);
          await this.mailer.send(alert.mail);
        });
        sent++;
      } catch (error) {
        // Another instance sent this one between the query and the write.
        if (isPrismaError(error, PrismaCode.UniqueViolation)) continue;
        this.logger.error({
          msg: 'Budget alert not sent',
          ...alert.about,
          err: error,
        });
      }
    }

    if (sent > 0) this.logger.log({ sent }, 'Budget alerts sent');
    return sent;
  }

  /**
   * Every overspent budget of the month that has not been mailed about.
   *
   * The month is each user's own: a background job has no request to tell
   * it the zone, so the account carries one. The limit of a category is its
   * latest version not after this month (DISTINCT ON over the unique index
   * on (category_id, effective_from)), and a NULL version means the
   * category stopped being budgeted.
   */
  private overspent(now: Date, userId?: string): Promise<Overspent[]> {
    return this.prisma.$queryRaw<Overspent[]>`
      WITH months AS (
        SELECT u.id AS user_id, u.email, u.time_zone,
               date_trunc('month', (${now}::timestamptz AT TIME ZONE u.time_zone))::date AS month
        FROM users u
        WHERE u.budget_alerts
          ${userId ? Prisma.sql`AND u.id = ${userId}::uuid` : Prisma.empty}
      ),
      current_limits AS (
        SELECT DISTINCT ON (b.category_id)
               b.category_id, b.amount, m.user_id, m.email, m.time_zone, m.month
        FROM budgets b
        JOIN months m ON m.user_id = b.user_id
        WHERE b.effective_from <= m.month
        ORDER BY b.category_id, b.effective_from DESC
      ),
      spending AS (
        SELECT l.user_id, l.email, l.category_id, l.amount, l.month,
               c.name AS category,
               ${categorySpent(
                 Prisma.sql`l.category_id`,
                 Prisma.sql`(l.month::timestamp AT TIME ZONE l.time_zone)`,
                 Prisma.sql`((l.month + interval '1 month')::timestamp AT TIME ZONE l.time_zone)`,
               )} AS spent
        FROM current_limits l
        JOIN categories c ON c.id = l.category_id
        -- Already mailed about this month, or no limit any more.
        LEFT JOIN budget_alerts a
          ON a.category_id = l.category_id AND a.month = l.month
        WHERE l.amount IS NOT NULL AND a.id IS NULL
      )
      SELECT user_id, email, category_id, category, month, spent,
             amount AS limit
      FROM spending
      WHERE spent >= amount
      ORDER BY user_id, category
    `;
  }

  /**
   * Every tag over its budget that has not been mailed about at this limit.
   * Over all time, so no zone and no clock: only the limit and what the
   * tag's expenses add up to (tagSpent, the same sum the tag list shows).
   */
  private overspentTags(userId?: string): Promise<OverspentTag[]> {
    return this.prisma.$queryRaw<OverspentTag[]>`
      SELECT * FROM (
        SELECT u.id AS user_id, u.email, g.id AS tag_id, g.name AS tag,
               g.budget AS limit,
               ${tagSpent(Prisma.sql`g.id`)} AS spent
        FROM tags g
        JOIN users u ON u.id = g.user_id
        -- Already mailed about this limit.
        LEFT JOIN tag_budget_alerts a
          ON a.tag_id = g.id AND a.limit = g.budget
        WHERE u.budget_alerts AND g.budget IS NOT NULL AND a.id IS NULL
          ${userId ? Prisma.sql`AND u.id = ${userId}::uuid` : Prisma.empty}
      ) overspent
      WHERE spent >= "limit"
      ORDER BY user_id, tag
    `;
  }
}
