import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../database/base.entity';
import { DecimalColumnTransformer } from '../../../common/transformers/decimal.transformer';
import { Product } from '../../products/entities/product.entity';
import { ProductVariant } from '../../products/entities/product-variant.entity';
import { Order } from './order.entity';

export interface OrderItemAddon {
  groupName: string;
  name: string;
  price: number;
}

@Check('CHK_order_items_quantity_positive', `"quantity" > 0`)
@Check('CHK_order_items_money_non_negative', `"unitPrice" >= 0 AND "total" >= 0`)
@Check('CHK_order_items_addons_array', `jsonb_typeof("addons") = 'array'`)
@Entity('order_items')
export class OrderItem extends BaseEntity {
  @ManyToOne(() => Order, (order) => order.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orderId' })
  order: Order;

  @Index()
  @Column({ type: 'uuid' })
  orderId: string;

  // Kept as a real FK for reporting/analytics even though name/price are
  // snapshotted below — never re-derive pricing from the live product.
  @ManyToOne(() => Product, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'productId' })
  product: Product;

  @Index()
  @Column({ type: 'uuid' })
  productId: string;

  // SET NULL (not RESTRICT): ProductsService.update() deletes and
  // recreates all variant rows for a product, so an old variant a past
  // order pointed at can legitimately disappear.
  @ManyToOne(() => ProductVariant, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'variantId' })
  variant?: ProductVariant | null;

  @Column({ type: 'uuid', nullable: true })
  variantId?: string | null;

  @Column({ type: 'varchar' })
  productNameSnapshot: string;

  @Column({ type: 'int' })
  quantity: number;

  /** Snapshot of the chosen add-ons; their prices are already in unitPrice. */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  addons: OrderItemAddon[];

  /** Whether placing the order took this quantity out of stock — false for
   * made-to-order items — so a cancel/return puts back exactly that. */
  @Column({ type: 'boolean', default: true })
  stockDeducted: boolean;

  @Column({ type: 'numeric', precision: 10, scale: 2, transformer: DecimalColumnTransformer })
  unitPrice: number;

  @Column({ type: 'numeric', precision: 10, scale: 2, transformer: DecimalColumnTransformer })
  total: number;
}
