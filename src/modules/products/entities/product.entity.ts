import { Check, Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../database/base.entity';
import { DecimalColumnTransformer } from '../../../common/transformers/decimal.transformer';
import { Store } from '../../stores/entities/store.entity';
import { Category } from '../../categories/entities/category.entity';
import { ProductImage } from './product-image.entity';
import { ProductVideo } from './product-video.entity';
import { ProductVariant } from './product-variant.entity';

export enum ProductDeliveryType {
  PICKUP = 'pickup',
  DELIVERY = 'delivery',
  BOTH = 'both',
}

export enum ProductStatus {
  ACTIVE = 'active',
  ARCHIVED = 'archived',
}

/** Restaurant dietary marker, shown as the green/red/brown dot on menus. */
export enum FoodType {
  VEG = 'veg',
  NON_VEG = 'non_veg',
  EGG = 'egg',
}

export interface ProductAddonOption {
  id: string;
  name: string;
  price: number;
  isAvailable: boolean;
}

/**
 * A choice the customer makes on top of the product, e.g. "Extras"
 * (pick 0-3) or "Spice level" (pick exactly 1). minSelect > 0 makes the
 * group required.
 */
export interface ProductAddonGroup {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  options: ProductAddonOption[];
}

@Check('CHK_products_money_non_negative', `"price" >= 0 AND ("discountPrice" IS NULL OR "discountPrice" >= 0)`)
@Check('CHK_products_stock_non_negative', `"stockQuantity" >= 0 AND "lowStockThreshold" >= 0`)
@Check('CHK_products_prep_time_non_negative', `"preparationTimeMins" IS NULL OR "preparationTimeMins" >= 0`)
@Check('CHK_products_addon_groups_array', `jsonb_typeof("addonGroups") = 'array'`)
// A barcode identifies one active product per store, so scans (and a future
// scan-to-sell POS) resolve unambiguously. Archived copies don't count.
@Index('UQ_products_store_active_barcode', ['storeId', 'barcode'], {
  unique: true,
  where: `"barcode" IS NOT NULL AND "status" = 'active'`,
})
@Entity('products')
export class Product extends BaseEntity {
  @ManyToOne(() => Store, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'storeId' })
  store: Store;

  @Index()
  @Column({ type: 'uuid' })
  storeId: string;

  @ManyToOne(() => Category, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'categoryId' })
  category: Category;

  @Index()
  @Column({ type: 'uuid' })
  categoryId: string;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'varchar', unique: true })
  slug: string;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({ type: 'varchar', nullable: true })
  sku?: string | null;

  @Index()
  @Column({ type: 'varchar', nullable: true })
  barcode?: string | null;

  @Column({ type: 'varchar', nullable: true })
  brand?: string | null;

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
    transformer: DecimalColumnTransformer,
  })
  price: number;

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: DecimalColumnTransformer,
  })
  discountPrice?: number | null;

  @Column({ type: 'int', default: 0 })
  stockQuantity: number;

  @Column({ type: 'int', default: 5 })
  lowStockThreshold: number;

  /**
   * When false, stockQuantity (and variant stock) is ignored: nothing is
   * checked or decremented on order. For made-to-order items like
   * restaurant dishes, where `isAvailable` is the on/off switch instead.
   */
  @Column({ type: 'boolean', default: true })
  trackInventory: boolean;

  /** Seller's "sold out / back on the menu" switch, independent of stock. */
  @Column({ type: 'boolean', default: true })
  isAvailable: boolean;

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: DecimalColumnTransformer,
  })
  weight?: number | null;

  @Column({ type: 'enum', enum: ProductDeliveryType, default: ProductDeliveryType.BOTH })
  deliveryType: ProductDeliveryType;

  @Column({ type: 'text', nullable: true })
  returnPolicy?: string | null;

  @Column({ type: 'enum', enum: ProductStatus, default: ProductStatus.ACTIVE })
  status: ProductStatus;

  @Column({
    type: 'numeric',
    precision: 3,
    scale: 2,
    default: 0,
    transformer: DecimalColumnTransformer,
  })
  avgRating: number;

  @Column({ type: 'int', default: 0 })
  reviewCount: number;

  @Column('simple-array', { nullable: true })
  tags?: string[] | null;

  // --- Restaurant ---

  @Column({ type: 'enum', enum: FoodType, nullable: true })
  foodType?: FoodType | null;

  @Column({ type: 'int', nullable: true })
  preparationTimeMins?: number | null;

  // JSONB rather than child tables: always read and replaced together with
  // the product, and order items snapshot the chosen options by value, so
  // nothing references a group/option row. Option ids stay stable across
  // edits (ProductsService keeps ids the client sends back) so cart lines
  // that reference them survive a menu edit.
  @Column({ type: 'jsonb', default: () => "'[]'" })
  addonGroups: ProductAddonGroup[];

  // --- Pharmacy ---

  /** Prescription (Rx) medicine: checkout needs an uploaded prescription the seller approves. */
  @Column({ type: 'boolean', default: false })
  requiresPrescription: boolean;

  /** Active ingredients / salt, e.g. "Paracetamol 500mg". */
  @Column({ type: 'varchar', nullable: true })
  composition?: string | null;

  /** Earliest expiry of the stock on hand ('YYYY-MM-DD'); expired products can't be sold. */
  @Column({ type: 'date', nullable: true })
  expiryDate?: string | null;

  @OneToMany(() => ProductImage, (image) => image.product, { cascade: true })
  images: ProductImage[];

  @OneToMany(() => ProductVideo, (video) => video.product, { cascade: true })
  videos: ProductVideo[];

  @OneToMany(() => ProductVariant, (variant) => variant.product, { cascade: true })
  variants: ProductVariant[];
}
