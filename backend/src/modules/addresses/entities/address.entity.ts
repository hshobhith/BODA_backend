import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { SoftDeletableEntity } from '../../../database/base.entity';
import { User } from '../../auth/entities/user.entity';
import { DecimalColumnTransformer } from '../../../common/transformers/decimal.transformer';

@Entity('addresses')
export class Address extends SoftDeletableEntity {
  @ManyToOne(() => User, (user) => user.addresses, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar' })
  label: string;

  @Column({ type: 'varchar' })
  line1: string;

  @Column({ type: 'varchar', nullable: true })
  line2?: string;

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

  @Column({ type: 'boolean', default: false })
  isDefault: boolean;
}
