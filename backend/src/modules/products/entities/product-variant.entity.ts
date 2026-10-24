import { Check, Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../database/base.entity';
import { DecimalColumnTransformer } from '../../../common/transformers/decimal.transformer';
import { Product } from './product.entity';

@Check('CHK_product_variants_stock_non_negative', `"stockQuantity" >= 0`)
@Entity('product_variants')
export class ProductVariant extends BaseEntity {
  @ManyToOne(() => Product, (product) => product.variants, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId' })
  product: Product;

  @Column({ type: 'uuid' })
  productId: string;

  /** e.g. "Size: L", "Color: Red" */
  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'varchar', nullable: true })
  sku?: string | null;

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
    default: 0,
    transformer: DecimalColumnTransformer,
  })
  priceDelta: number;

  @Column({ type: 'int', default: 0 })
  stockQuantity: number;
}
