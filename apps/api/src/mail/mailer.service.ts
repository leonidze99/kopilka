import { Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';
import type { Env } from '../config/env.js';

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * Sends mail over SMTP, which every provider offers (Resend, Postmark,
 * Mailgun, a company server), so the app needs no provider-specific client:
 * one `MAIL_SMTP_URL` points it anywhere.
 *
 * Without that variable — development and tests — nothing leaves the
 * process: the message goes to the log instead, where the link in it can be
 * read and followed. A failure to send is not swallowed: the caller gets the
 * error and the user is told something went wrong, rather than waiting for
 * mail that was never accepted.
 */
@Injectable()
export class MailerService implements OnApplicationShutdown {
  private readonly logger = new Logger(MailerService.name);
  private readonly from: string;
  private readonly transport: Transporter | null;

  constructor(config: ConfigService<Env, true>) {
    this.from = config.get('MAIL_FROM', { infer: true });
    const url = config.get('MAIL_SMTP_URL', { infer: true });
    // Lazy: no connection is opened until the first message.
    this.transport = url ? createTransport(url) : null;
  }

  async send(mail: Mail): Promise<void> {
    if (!this.transport) {
      // With the body: in development the link is the point.
      this.logger.log({ msg: 'Mail not sent (no MAIL_SMTP_URL)', ...mail });
      return;
    }
    await this.transport.sendMail({ from: this.from, ...mail });
    this.logger.log({ msg: 'Mail sent', to: mail.to, subject: mail.subject });
  }

  /** Lets the SMTP pool close its sockets on a clean shutdown. */
  onApplicationShutdown(): void {
    this.transport?.close();
  }
}
