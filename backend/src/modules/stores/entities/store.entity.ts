import { Check, Column, Entity, JoinColumn, ManyToOne, OneToMany, OneToOne } from 'typeorm';
import { BaseEntity } from '../../../database/base.entity';
import { DecimalColumnTransformer } from '../../../common/transformers/decimal.transformer';
import { User } from '../../auth/entities/user.entity';
import { StoreWorkingHours } from './store-working-hours.entity';
import { StoreDeliverySettings } from './store-delivery-settings.entity';

export enum StoreVisibilityType {
  RADIUS_5 = 'radius_5',
  RADIUS_10 = 'radius_10',
  RADIUS_25 = 'radius_25',
  RADIUS_50 = 'radius_50',
  STATE = 'state',
  COUNTRY = 'country',
  GLOBAL = 'global',
}

export enum StoreStatus {
  OPEN = 'open',
  CLOSED = 'closed',
  TEMPORARILY_CLOSED = 'temporarily_closed',
  VACATION = 'vacation',
}

export enum StoreApprovalStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  SUSPENDED = 'suspended',
}

/**
 * Drives type-specific behavior, unlike the free-text `businessType` label:
 * restaurants get food tags, add-ons and a kitchen-style order flow;
 * pharmacies get prescription-gated checkout. Fixed at creation (see
 * UpdateStoreDto) since approval is granted against the licence for that type.
 */
export enum StoreType {
  RETAIL = 'retail',
  RESTAURANT = 'restaurant',
  PHARMACY = 'pharmacy',
}

/** Store types that must hold a licence to operate (FSSAI / drug licence). */
export const LICENSED_STORE_TYPES: StoreType[] = [StoreType.RESTAURANT, StoreType.PHARMACY];

// Backstop for StoresService's licence rule (LICENSED_STORE_TYPES).
@Check('CHK_stores_licence_for_licensed_types', `"storeType" = 'retail' OR btrim(coalesce("licenseInfo", '')) <> ''`)
@Entity('stores')
export class Store extends BaseEntity {
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sellerId' })
  seller: User;

  @Column({ type: 'uuid' })
  sellerId: string;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'varchar', unique: true })
  slug: string;

  @Column({ type: 'varchar', nullable: true })
  logoUrl?: string | null;

  @Column({ type: 'varchar', nullable: true })
  bannerUrl?: string | null;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({ type: 'enum', enum: StoreType, default: StoreType.RETAIL })
  storeType: StoreType;

  @Column({ type: 'varchar' })
  businessType: string;

  @Column({ type: 'varchar', nullable: true })
  gstNumber?: string | null;

  @Column({ type: 'varchar', nullable: true })
  licenseInfo?: string | null;

  @Column({ type: 'varchar' })
  phone: string;

  @Column({ type: 'varchar' })
  email: string;

  @Column({ type: 'varchar' })
  addressLine: string;

  @Column({ type: 'varchar' })
  city: string;

  @Column({ type: 'varchar' })
  state: string;

  @Column({ type: 'varchar' })
  country: string;

  @Column({ type: 'varchar' })
  pincode: string;

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 6,
    transformer: DecimalColumnTransformer,
  })
  lat: number;

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 6,
    transformer: DecimalColumnTransformer,
  })
  lng: number;

  @Column({ type: 'enum', enum: StoreVisibilityType, default: StoreVisibilityType.RADIUS_10 })
  visibilityType: StoreVisibilityType;

  @Column({ type: 'enum', enum: StoreStatus, default: StoreStatus.CLOSED })
  status: StoreStatus;

  @Column({ type: 'enum', enum: StoreApprovalStatus, default: StoreApprovalStatus.PENDING })
  approvalStatus: StoreApprovalStatus;

  @Column({ type: 'boolean', default: false })
  isVerified: boolean;

  @Column({ type: 'varchar', nullable: true })
  rejectionReason?: string | null;

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

  @OneToMany(() => StoreWorkingHours, (wh) => wh.store, { cascade: true })
  workingHours: StoreWorkingHours[];

  @OneToOne(() => StoreDeliverySettings, (ds) => ds.store, { cascade: true })
  deliverySettings: StoreDeliverySettings;
}
