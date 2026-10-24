import { Check, Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../database/base.entity';
import { DecimalColumnTransformer } from '../../../common/transformers/decimal.transformer';
import { User } from '../../auth/entities/user.entity';
import { Store } from '../../stores/entities/store.entity';
import { Address } from '../../addresses/entities/address.entity';
import {
  FulfillmentType,
  OrderChannel,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PrescriptionStatus,
} from '../../../common/enums/order-status.enum';
import { OrderItem } from './order-item.entity';
import { OrderStatusHistory } from './order-status-history.entity';

@Check('CHK_orders_money_non_negative', `"subtotal" >= 0 AND "deliveryFee" >= 0 AND "discount" >= 0 AND "tax" >= 0 AND "total" >= 0`)
// An order has prescription files exactly when it needed a prescription.
@Check(
  'CHK_orders_prescription_files_match_status',
  `jsonb_typeof("prescriptionKeys") = 'array' AND ("prescriptionStatus" = 'not_required') = (jsonb_array_length("prescriptionKeys") = 0)`,
)
@Entity('orders')
export class Order extends BaseEntity {
  @Column({ type: 'varchar', unique: true })
  orderNumber: string;

  // Null for a POS/offline sale (channel = 'pos') — there's no logged-in
  // customer for an in-store transaction, see guestName/guestPhone below.
  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'customerId' })
  customer?: User | null;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  customerId?: string | null;

  @Column({ type: 'enum', enum: OrderChannel, default: OrderChannel.ONLINE })
  channel: OrderChannel;

  @Column({ type: 'varchar', nullable: true })
  guestName?: string | null;

  @Column({ type: 'varchar', nullable: true })
  guestPhone?: string | null;

  @ManyToOne(() => Store, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'storeId' })
  store: Store;

  @Index()
  @Column({ type: 'uuid' })
  storeId: string;

  @Column({ type: 'enum', enum: OrderStatus, default: OrderStatus.NEW })
  status: OrderStatus;

  @Column({ type: 'enum', enum: FulfillmentType })
  fulfillmentType: FulfillmentType;

  @ManyToOne(() => Address, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'deliveryAddressId' })
  deliveryAddress?: Address | null;

  @Column({ type: 'uuid', nullable: true })
  deliveryAddressId?: string | null;

  @Column({ type: 'numeric', precision: 10, scale: 2, transformer: DecimalColumnTransformer })
  subtotal: number;

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
    default: 0,
    transformer: DecimalColumnTransformer,
  })
  discount: number;

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
    default: 0,
    transformer: DecimalColumnTransformer,
  })
  tax: number;

  @Column({ type: 'numeric', precision: 10, scale: 2, transformer: DecimalColumnTransformer })
  total: number;

  @Column({ type: 'enum', enum: PaymentMethod, default: PaymentMethod.COD })
  paymentMethod: PaymentMethod;

  @Column({ type: 'enum', enum: PaymentStatus, default: PaymentStatus.PENDING })
  paymentStatus: PaymentStatus;

  @Column({ type: 'text', nullable: true })
  customerNote?: string | null;

  @Column({ type: 'enum', enum: PrescriptionStatus, default: PrescriptionStatus.NOT_REQUIRED })
  prescriptionStatus: PrescriptionStatus;

  /** Private storage keys (UploadsService.uploadPrescription), read back
   * through GET /orders/:id/prescriptions/:index — never a public URL. */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  prescriptionKeys: string[];

  /** The seller's review note, e.g. why a prescription was rejected. */
  @Column({ type: 'text', nullable: true })
  prescriptionNote?: string | null;

  @Column({ type: 'timestamptz' })
  placedAt: Date;

  @OneToMany(() => OrderItem, (item) => item.order, { cascade: true })
  items: OrderItem[];

  @OneToMany(() => OrderStatusHistory, (history) => history.order, { cascade: true })
  statusHistory: OrderStatusHistory[];
}
