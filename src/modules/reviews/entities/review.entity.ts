import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { SoftDeletableEntity } from '../../../database/base.entity';
import { User } from '../../auth/entities/user.entity';

export enum ReviewTargetType {
  PRODUCT = 'product',
  STORE = 'store',
}

@Entity('reviews')
// One live review per user and target; a deleted one doesn't stop them reviewing again.
@Index('UQ_reviews_active_user_target', ['userId', 'targetType', 'targetId'], {
  unique: true,
  where: `"deletedAt" IS NULL`,
})
export class Review extends SoftDeletableEntity {
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'enum', enum: ReviewTargetType })
  targetType: ReviewTargetType;

  // Polymorphic pointer at either a Product or a Store row — intentionally
  // not a TypeORM relation since it targets two different tables.
  @Index()
  @Column({ type: 'uuid' })
  targetId: string;

  @Column({ type: 'smallint' })
  rating: number;

  @Column({ type: 'text', nullable: true })
  comment?: string | null;

  @Column('simple-array', { nullable: true })
  images?: string[] | null;

  // Set by the owning seller via `PATCH /reviews/:id/reply`. Only ever the
  // seller of the store this review targets (directly, or via the product's
  // store) may set/clear these — see ReviewsService.reply/removeReply.
  @Column({ type: 'text', nullable: true })
  sellerReply?: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  sellerRepliedAt?: Date | null;
}
