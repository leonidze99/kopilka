import type { Mail } from '../../src/mail/mailer.service.js';

/**
 * Stands in for MailerService in e2e: keeps the messages instead of sending
 * them, so a test can follow the link a user would have received.
 */
export class FakeMailer {
  readonly sent: Mail[] = [];

  send(mail: Mail): Promise<void> {
    this.sent.push(mail);
    return Promise.resolve();
  }

  to(address: string): Mail[] {
    return this.sent.filter((mail) => mail.to === address);
  }

  /** The token out of the newest reset link sent to that address. */
  tokenFor(address: string): string {
    const mails = this.to(address);
    const text = mails[mails.length - 1]?.text ?? '';
    const token = /[?&]token=([\w-]+)/.exec(text)?.[1];
    if (!token) throw new Error(`no reset link mailed to ${address}`);
    return token;
  }
}
