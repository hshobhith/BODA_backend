import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from '../../common/enums/role.enum';
import { PaginatedResult, paginate } from '../../common/utils/paginate.util';
import { User, UserStatus } from '../auth/entities/user.entity';
import { MailService } from '../mail/mail.service';
import { renderNotificationEmail } from '../mail/templates/notification-email';
import { Notification, NotificationChannel } from './entities/notification.entity';
import { NotificationsGateway } from './notifications.gateway';

/** Sent to admins when a seller creates a store that needs approval. */
export const STORE_SUBMITTED_NOTIFICATION = 'store.submitted';

export interface CreateNotificationDto {
  type: string;
  title: string;
  body: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notificationsRepository: Repository<Notification>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly notificationsGateway: NotificationsGateway,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
  ) {}

  async notify(userId: string, dto: CreateNotificationDto): Promise<Notification> {
    const notification = this.notificationsRepository.create({
      userId,
      type: dto.type,
      title: dto.title,
      body: dto.body,
      metadata: dto.metadata,
      channel: NotificationChannel.IN_APP,
    });

    const saved = await this.notificationsRepository.save(notification);

    this.notificationsGateway.emitToUser(userId, 'notification', saved);

    // Not awaited: an SMTP round-trip mustn't slow down the order or moderation
    // action that triggered this, and a mail failure mustn't fail it either.
    void this.sendEmailCopy(userId, saved);

    return saved;
  }

  /**
   * Notifies every active admin (bell + email copy, same as `notify`), and also
   * emails the support inbox (`SUPPORT_EMAIL`) unless an admin already uses it,
   * so platform alerts reach a real, monitored mailbox even when the admin
   * accounts' own addresses aren't checked. Never throws.
   */
  async notifyAdmins(dto: CreateNotificationDto): Promise<void> {
    try {
      const admins = await this.usersRepository.find({
        where: { role: Role.ADMIN, status: UserStatus.ACTIVE },
        select: { id: true, email: true },
      });
      for (const admin of admins) {
        await this.notify(admin.id, dto);
      }

      const supportEmail = this.configService.get<string>('app.supportEmail');
      const adminEmails = new Set(admins.map((admin) => admin.email.toLowerCase()));
      if (supportEmail && !adminEmails.has(supportEmail.toLowerCase())) {
        const html = this.renderEmail('BODA team', dto);
        await this.mailService.send(supportEmail, dto.title, html);
      }
    } catch (err) {
      this.logger.error(`Failed to notify admins (${dto.type})`, err as Error);
    }
  }

  /** Emails the recipient the same title, body and link they see under the bell. */
  private async sendEmailCopy(userId: string, notification: Notification): Promise<void> {
    try {
      const user = await this.usersRepository.findOne({
        where: { id: userId },
        select: { id: true, email: true, fullName: true },
      });
      if (!user) {
        return;
      }

      const html = this.renderEmail(user.fullName, notification);
      await this.mailService.send(user.email, notification.title, html);
    } catch (err) {
      this.logger.error(`Failed to email notification ${notification.id}`, err as Error);
    }
  }

  private renderEmail(
    recipientName: string,
    notification: Pick<Notification, 'type' | 'title' | 'body' | 'metadata'>,
  ): string {
    const link = this.notificationLink(notification);
    const frontendUrl = this.configService.get<string>('app.frontendUrl');
    return renderNotificationEmail({
      recipientName,
      title: notification.title,
      body: notification.body,
      actionUrl: link ? `${frontendUrl}${link.path}` : undefined,
      actionLabel: link?.label,
    });
  }

  /** Mirrors the frontend's `notificationHref`, so the email opens the same page the bell does. */
  private notificationLink(
    notification: Pick<Notification, 'type' | 'metadata'>,
  ): { path: string; label: string } | null {
    // A new store waiting for approval goes to the admin approval queue.
    if (notification.type === STORE_SUBMITTED_NOTIFICATION) {
      return { path: '/admin/stores', label: 'Review store' };
    }
    const orderId = notification.metadata?.orderId;
    if (typeof orderId === 'string') {
      return { path: `/account/orders/${orderId}`, label: 'View order' };
    }
    if (typeof notification.metadata?.storeId === 'string') {
      return { path: '/seller/dashboard', label: 'Open seller dashboard' };
    }
    return null;
  }

  async findForUser(
    userId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedResult<Notification>> {
    const [data, total] = await this.notificationsRepository.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return paginate(data, total, page, limit);
  }

  async unreadCount(userId: string): Promise<{ count: number }> {
    const count = await this.notificationsRepository
      .createQueryBuilder('notification')
      .where('notification.userId = :userId', { userId })
      .andWhere('notification.readAt IS NULL')
      .getCount();

    return { count };
  }

  async markRead(userId: string, notificationId: string): Promise<Notification> {
    const notification = await this.notificationsRepository.findOne({
      where: { id: notificationId },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    if (notification.userId !== userId) {
      throw new ForbiddenException('You do not have access to this notification');
    }

    if (!notification.readAt) {
      notification.readAt = new Date();
      await this.notificationsRepository.save(notification);
    }

    return notification;
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    const result = await this.notificationsRepository
      .createQueryBuilder()
      .update(Notification)
      .set({ readAt: new Date() })
      .where('userId = :userId', { userId })
      .andWhere('readAt IS NULL')
      .execute();

    return { updated: result.affected ?? 0 };
  }
}
