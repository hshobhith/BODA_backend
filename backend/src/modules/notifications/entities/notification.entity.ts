import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../database/base.entity';
import { User } from '../../auth/entities/user.entity';

export enum NotificationChannel {
  IN_APP = 'in_app',
  EMAIL = 'email',
}

@Entity('notifications')
export class Notification extends BaseEntity {
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar' })
  type: string;

  @Column({ type: 'varchar' })
  title: string;

  @Column({ type: 'text' })
  body: string;

  @Column({
    type: 'enum',
    enum: NotificationChannel,
    default: NotificationChannel.IN_APP,
  })
  channel: NotificationChannel;

  @Column({ type: 'timestamptz', nullable: true })
  readAt?: Date | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any> | null;
}
