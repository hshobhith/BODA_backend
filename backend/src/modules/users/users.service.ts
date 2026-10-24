import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Role } from '../../common/enums/role.enum';
import { paginate, PaginatedResult } from '../../common/utils/paginate.util';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { User, UserStatus } from '../auth/entities/user.entity';
import { Store, StoreApprovalStatus, StoreStatus } from '../stores/entities/store.entity';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async findById(id: string): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { email } });
  }

  async updateProfile(id: string, dto: UpdateProfileDto): Promise<User> {
    const user = await this.findById(id);
    Object.assign(user, dto);
    return this.usersRepository.save(user);
  }

  async list(
    page: number,
    limit: number,
    role?: Role,
  ): Promise<PaginatedResult<User>> {
    const [data, total] = await this.usersRepository.findAndCount({
      where: role ? { role } : {},
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' },
    });

    return paginate(data, total, page, limit);
  }

  // ---------------------------------------------------------------------
  // Admin-facing (called directly by the Admin module's service layer)
  // ---------------------------------------------------------------------

  async suspend(userId: string): Promise<User> {
    const user = await this.findById(userId);
    user.status = UserStatus.SUSPENDED;
    return this.usersRepository.save(user);
  }

  async unsuspend(userId: string): Promise<User> {
    const user = await this.findById(userId);
    user.status = UserStatus.ACTIVE;
    return this.usersRepository.save(user);
  }

  /**
   * Soft delete: the row stays (stamped `deletedAt`) so the user's orders,
   * stores and audit trail keep pointing at a real record. They drop out of
   * every normal query, can't sign in or sign up again with the same account,
   * and are signed out everywhere. A seller's stores are closed and suspended
   * so shoppers no longer see them.
   *
   * Guards against removing the last remaining admin account so the platform
   * can never be left without one; self-deletion checks are the caller's
   * (Admin module's) job since they need the acting admin's identity.
   */
  async remove(userId: string): Promise<void> {
    const user = await this.findById(userId);
    if (user.role === Role.ADMIN) {
      const adminCount = await this.usersRepository.count({ where: { role: Role.ADMIN } });
      if (adminCount <= 1) {
        throw new BadRequestException('Cannot delete the last remaining admin account');
      }
    }

    await this.usersRepository.manager.transaction(async (manager) => {
      await manager.softRemove(user);
      await manager.update(
        RefreshToken,
        { userId: user.id, revokedAt: IsNull() },
        { revokedAt: new Date() },
      );
      await manager.update(
        Store,
        { sellerId: user.id },
        {
          approvalStatus: StoreApprovalStatus.SUSPENDED,
          status: StoreStatus.CLOSED,
          isVerified: false,
        },
      );
    });
  }

  async countByRole(role: Role): Promise<number> {
    return this.usersRepository.count({ where: { role } });
  }

  /**
   * Admin-driven role change (the "without direct database access" gap —
   * self-service upgrades are limited to customer -> seller, see
   * `AuthService.becomeSeller`). Guards the same last-admin invariant as
   * `remove()`.
   */
  async updateRole(userId: string, role: Role): Promise<User> {
    const user = await this.findById(userId);

    if (user.role === Role.ADMIN && role !== Role.ADMIN) {
      const adminCount = await this.usersRepository.count({ where: { role: Role.ADMIN } });
      if (adminCount <= 1) {
        throw new BadRequestException('Cannot change the role of the last remaining admin account');
      }
    }

    user.role = role;
    return this.usersRepository.save(user);
  }
}
