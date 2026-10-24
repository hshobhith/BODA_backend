import { Column, Entity, JoinColumn, OneToOne } from 'typeorm';
import { BaseEntity } from '../../../database/base.entity';
import { DecimalColumnTransformer } from '../../../common/transformers/decimal.transformer';
import { Store } from './store.entity';

export enum DeliveryMode {
  PICKUP_ONLY = 'pickup_only',
  DELIVERY = 'delivery',
  BOTH = 'both',
}

export enum DeliverySpeed {
  TEN_MIN = '10_min',
  SAME_DAY = 'same_day',
  NEXT_DAY = 'next_day',
  THREE_TO_FIVE_DAYS = '3_5_days',
  CUSTOM = 'custom',
}

@Entity('store_delivery_settings')
export class StoreDeliverySettings extends BaseEntity {
  @OneToOne(() => Store, (store) => store.deliverySettings, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'storeId' })
  store: Store;

  @Column({ type: 'uuid', unique: true })
  storeId: string;

  @Column({ type: 'enum', enum: DeliveryMode, default: DeliveryMode.PICKUP_ONLY })
  mode: DeliveryMode;

  @Column({
    type: 'numeric',
    precision: 6,
    scale: 2,
    nullable: true,
    transformer: DecimalColumnTransformer,
  })
  deliveryRadiusKm?: number | null;

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
    default: 0,
    transformer: DecimalColumnTransformer,
  })
  deliveryFee: number;

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: DecimalColumnTransformer,
  })
  freeDeliveryThreshold?: number | null;

  @Column({ type: 'enum', enum: DeliverySpeed, default: DeliverySpeed.SAME_DAY })
  deliverySpeed: DeliverySpeed;

  @Column({ type: 'varchar', nullable: true })
  customWindowNote?: string | null;
}
