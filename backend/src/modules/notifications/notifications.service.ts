import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaginatedResult, paginate } from '../../common/utils/paginate.util';
import { User } from '../auth/entities/user.entity';
import { MailService } from '../mail/mail.service';
import { renderNotificationEmail } from '../mail/templates/notification-email';
import { Notification, NotificationChannel } from './entities/notification.entity';
import { NotificationsGateway } from './notifications.gateway';

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

      const link = this.notificationLink(notification);
      const frontendUrl = this.configService.get<string>('app.frontendUrl');
      const html = renderNotificationEmail({
        recipientName: user.fullName,
        title: notification.title,
        body: notification.body,
        actionUrl: link ? `${frontendUrl}${link.path}` : undefined,
        actionLabel: link?.label,
      });

      await this.mailService.send(user.email, notification.title, html);
    } catch (err) {
      this.logger.error(`Failed to email notification ${notification.id}`, err as Error);
    }
  }

  /** Mirrors the frontend's `notificationHref`, so the email opens the same page the bell does. */
  private notificationLink(notification: Notification): { path: string; label: string } | null {
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
