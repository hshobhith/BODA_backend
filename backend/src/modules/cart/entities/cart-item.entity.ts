import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { SoftDeletableEntity } from '../../../database/base.entity';
import { User } from '../../auth/entities/user.entity';
import { Product } from '../../products/entities/product.entity';
import { ProductVariant } from '../../products/entities/product-variant.entity';

/**
 * There is no separate `Cart` header entity — per the entity contract, a
 * user's cart *is* the set of their `CartItem` rows with
 * `savedForLater = false`; toggling the flag moves a row to/from the
 * "saved for later" shelf without ever deleting/recreating it.
 *
 * NOTE on uniqueness: we intentionally do NOT declare a DB-level unique
 * index on (userId, productId, variantId). Postgres treats NULLs as
 * distinct under a plain unique index, so two rows with the same product
 * and both NULL variantId would NOT collide — which would silently defeat
 * the constraint for every non-variant product (the common case). Rather
 * than fight Postgres with partial/COALESCE-based unique indexes, we
 * enforce this invariant at the application level in `CartService`
 * (find-or-create: look up the existing non-saved row for the exact
 * user/product/variant combo before inserting). That is simpler, exact,
 * and doesn't depend on NULL semantics for a column that's nullable.
 */
@Check('CHK_cart_items_quantity_positive', `"quantity" > 0`)
@Check('CHK_cart_items_addon_ids_array', `jsonb_typeof("addonOptionIds") = 'array'`)
@Entity('cart_items')
export class CartItem extends SoftDeletableEntity {
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId' })
  product: Product;

  @Index()
  @Column({ type: 'uuid' })
  productId: string;

  @ManyToOne(() => ProductVariant, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'variantId' })
  variant?: ProductVariant | null;

  @Column({ type: 'uuid', nullable: true })
  variantId?: string | null;

  /**
   * Chosen restaurant add-on option ids (see Product.addonGroups), kept in
   * menu order. Same product + variant with a different add-on choice is a
   * separate cart line.
   */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  addonOptionIds: string[];

  @Column({ type: 'int' })
  quantity: number;

  @Column({ type: 'boolean', default: false })
  savedForLater: boolean;
}
