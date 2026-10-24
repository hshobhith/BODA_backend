import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { escapeHtml } from '../../common/utils/escape-html.util';
import { MailService } from '../mail/mail.service';
import { ContactTopic, CreateContactMessageDto } from './dto/create-contact-message.dto';

const TOPIC_LABELS: Record<ContactTopic, string> = {
  [ContactTopic.ORDER]: 'Order help',
  [ContactTopic.RETURNS]: 'Returns & refunds',
  [ContactTopic.ACCOUNT]: 'Account',
  [ContactTopic.SELLING]: 'Selling on BODA',
  [ContactTopic.OTHER]: 'Other',
};

@Injectable()
export class ContactService {
  constructor(
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Forwards a contact-form message to the support inbox, with Reply-To set
   * to the sender so support can answer straight from their mail client.
   * Nothing is persisted — support ticketing is a Phase 2 item.
   */
  async submit(dto: CreateContactMessageDto): Promise<void> {
    const supportEmail = this.configService.get<string>('app.supportEmail') ?? 'support@boda.local';
    const topic = TOPIC_LABELS[dto.topic];
    const subject = `[Contact] ${topic}${dto.orderNumber ? ` — order ${dto.orderNumber}` : ''}`;

    const rows = [
      ['Name', dto.name],
      ['Email', dto.email],
      ['Topic', topic],
      ['Order number', dto.orderNumber ?? '—'],
    ]
      .map(([label, value]) => `<tr><td><strong>${label}</strong></td><td>${escapeHtml(value)}</td></tr>`)
      .join('');
    const html = `<table>${rows}</table><p>${escapeHtml(dto.message).replace(/\r?\n/g, '<br>')}</p>`;

    const sent = await this.mailService.send(supportEmail, subject, html, { replyTo: dto.email });
    if (!sent) {
      throw new ServiceUnavailableException(
        `We couldn't send your message right now. Please email us directly at ${supportEmail}.`,
      );
    }
  }
}
