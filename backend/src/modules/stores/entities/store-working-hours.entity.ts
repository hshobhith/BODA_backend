import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseEntity } from '../../../database/base.entity';
import { Store } from './store.entity';

/**
 * One row per (store, dayOfWeek). dayOfWeek follows JS `Date#getDay()`
 * convention: 0 = Sunday .. 6 = Saturday.
 * Times are stored as zero-padded 'HH:mm' strings so they can be compared
 * lexicographically without timezone conversion headaches.
 */
@Entity('store_working_hours')
@Unique(['storeId', 'dayOfWeek'])
export class StoreWorkingHours extends BaseEntity {
  @ManyToOne(() => Store, (store) => store.workingHours, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'storeId' })
  store: Store;

  @Index()
  @Column({ type: 'uuid' })
  storeId: string;

  @Column({ type: 'smallint' })
  dayOfWeek: number;

  @Column({ type: 'varchar', length: 5, nullable: true })
  openTime?: string | null;

  @Column({ type: 'varchar', length: 5, nullable: true })
  closeTime?: string | null;

  @Column({ type: 'varchar', length: 5, nullable: true })
  breakStart?: string | null;

  @Column({ type: 'varchar', length: 5, nullable: true })
  breakEnd?: string | null;

  @Column({ type: 'boolean', default: false })
  isHoliday: boolean;
}
