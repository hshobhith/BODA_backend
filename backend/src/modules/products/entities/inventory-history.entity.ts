import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../database/base.entity';
import { Product } from './product.entity';
import { ProductVariant } from './product-variant.entity';

@Entity('inventory_history')
export class InventoryHistory extends BaseEntity {
  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId' })
  product: Product;

  @Column({ type: 'uuid' })
  productId: string;

  @ManyToOne(() => ProductVariant, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'variantId' })
  variant?: ProductVariant | null;

  @Column({ type: 'uuid', nullable: true })
  variantId?: string | null;

  /** Signed delta applied to stockQuantity. Negative = decrement. */
  @Column({ type: 'int' })
  changeQty: number;

  /** e.g. 'order_placed', 'order_cancelled', 'manual_adjustment', 'restock' */
  @Column({ type: 'varchar' })
  reason: string;

  @Column({ type: 'int' })
  previousQty: number;

  @Column({ type: 'int' })
  newQty: number;
}
