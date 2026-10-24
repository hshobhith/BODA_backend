import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(private readonly configService: ConfigService) {
    this.from = this.configService.get<string>('MAIL_FROM') ?? '"BODA" <no-reply@boda.local>';

    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('MAIL_HOST'),
      port: this.configService.get<number>('MAIL_PORT'),
      // Joi validation turns MAIL_SECURE into a real boolean, so compare as a string to accept both.
      secure: String(this.configService.get('MAIL_SECURE')) === 'true',
      auth: this.configService.get<string>('MAIL_USER')
        ? {
            user: this.configService.get<string>('MAIL_USER'),
            pass: this.configService.get<string>('MAIL_PASSWORD'),
          }
        : undefined,
    });
  }

  /**
   * Never throws — a failed send is logged and reported via the return value,
   * so fire-and-forget callers (verification/reset emails) can ignore it while
   * callers that must tell the user (the contact form) can check it.
   */
  async send(
    to: string,
    subject: string,
    html: string,
    options: { replyTo?: string } = {},
  ): Promise<boolean> {
    try {
      await this.transporter.sendMail({
        from: this.from,
        to,
        subject,
        html,
        replyTo: options.replyTo,
      });
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to send email to ${to}: ${(error as Error).message}`,
        (error as Error).stack,
      );
      return false;
    }
  }
}
