import { Exclude } from 'class-transformer';
import { Column, Entity, OneToMany } from 'typeorm';
import { SoftDeletableEntity } from '../../../database/base.entity';
import { Role } from '../../../common/enums/role.enum';
import { Address } from '../../addresses/entities/address.entity';

export enum UserStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
}

@Entity('users')
export class User extends SoftDeletableEntity {
  @Column({ type: 'varchar', unique: true })
  email: string;

  @Column({ type: 'varchar', nullable: true })
  phone?: string;

  /** Null for accounts created through Google sign-in, which have no password. */
  @Exclude({ toPlainOnly: true })
  @Column({ type: 'varchar', nullable: true })
  passwordHash: string | null;

  /** Google's stable account id (`sub` claim), set on first Google sign-in. */
  @Exclude({ toPlainOnly: true })
  @Column({ type: 'varchar', nullable: true, unique: true })
  googleId?: string | null;

  @Column({ type: 'enum', enum: Role, default: Role.CUSTOMER })
  role: Role;

  @Column({ type: 'varchar' })
  fullName: string;

  @Column({ type: 'varchar', nullable: true })
  avatarUrl?: string;

  @Column({ type: 'enum', enum: UserStatus, default: UserStatus.ACTIVE })
  status: UserStatus;

  @Column({ type: 'timestamptz', nullable: true })
  emailVerifiedAt?: Date | null;

  @Exclude({ toPlainOnly: true })
  @Column({ type: 'varchar', nullable: true })
  passwordResetTokenHash?: string | null;

  @Exclude({ toPlainOnly: true })
  @Column({ type: 'timestamptz', nullable: true })
  passwordResetExpiresAt?: Date | null;

  @Exclude({ toPlainOnly: true })
  @Column({ type: 'varchar', nullable: true })
  emailVerificationTokenHash?: string | null;

  @Exclude({ toPlainOnly: true })
  @Column({ type: 'timestamptz', nullable: true })
  emailVerificationExpiresAt?: Date | null;

  @OneToMany(() => Address, (address) => address.user)
  addresses: Address[];
}
