import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../database/base.entity';
import { Product } from './product.entity';

@Entity('product_videos')
export class ProductVideo extends BaseEntity {
  @ManyToOne(() => Product, (product) => product.videos, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId' })
  product: Product;

  @Column({ type: 'uuid' })
  productId: string;

  @Column({ type: 'varchar' })
  url: string;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;
}
