import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { SoftDeletableEntity } from '../../../database/base.entity';
import { User } from '../../auth/entities/user.entity';

export enum WishlistTargetType {
  PRODUCT = 'product',
  STORE = 'store',
}

@Entity('wishlist_items')
// Removing an item only soft-deletes it, so the same item can be wishlisted again.
@Index('UQ_wishlist_items_active_user_target', ['userId', 'targetType', 'targetId'], {
  unique: true,
  where: `"deletedAt" IS NULL`,
})
export class WishlistItem extends SoftDeletableEntity {
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'enum', enum: WishlistTargetType })
  targetType: WishlistTargetType;

  // Polymorphic pointer at either a Product or a Store row — intentionally
  // not a TypeORM relation since it targets two different tables.
  @Index()
  @Column({ type: 'uuid' })
  targetId: string;
}
