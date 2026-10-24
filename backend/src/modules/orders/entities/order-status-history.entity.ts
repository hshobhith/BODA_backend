import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../database/base.entity';
import { User } from '../../auth/entities/user.entity';
import { OrderStatus } from '../../../common/enums/order-status.enum';
import { Order } from './order.entity';

@Entity('order_status_history')
export class OrderStatusHistory extends BaseEntity {
  @ManyToOne(() => Order, (order) => order.statusHistory, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orderId' })
  order: Order;

  @Index()
  @Column({ type: 'uuid' })
  orderId: string;

  @Column({ type: 'enum', enum: OrderStatus })
  status: OrderStatus;

  @Column({ type: 'text', nullable: true })
  note?: string | null;

  // Null for system-generated transitions.
  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'changedById' })
  changedBy?: User | null;

  @Column({ type: 'uuid', nullable: true })
  changedById?: string | null;
}
