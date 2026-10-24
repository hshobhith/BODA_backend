import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Role } from '../../common/enums/role.enum';
import { PaginatedResult } from '../../common/utils/paginate.util';
import { UsersService } from '../users/users.service';
import { User } from '../auth/entities/user.entity';
import { StoresService } from '../stores/stores.service';
import { Store, StoreApprovalStatus, StoreType } from '../stores/entities/store.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { ReviewsService } from '../reviews/reviews.service';
import { ProductsService } from '../products/products.service';
import { ProductStatus } from '../products/entities/product.entity';
import { OrdersService } from '../orders/orders.service';
import { Order } from '../orders/entities/order.entity';
import { OrderStatus } from '../../common/enums/order-status.enum';
import { QueryOrdersDto } from '../orders/dto/query-orders.dto';
import { QueryAdminUsersDto } from './dto/query-admin-users.dto';
import { CurrentUserPayload } from '../../common/decorators/current-user.decorator';

export interface AdminAnalyticsOverview {
  users: {
    total: number;
    byRole: Record<Role, number>;
  };
  stores: {
    total: number;
    byApprovalStatus: Record<StoreApprovalStatus, number>;
    byType: Record<StoreType, number>;
  };
  products: {
    total: number;
    byStatus: Record<ProductStatus, number>;
  };
  orders: {
    total: number;
    byStatus: Record<OrderStatus, number>;
  };
  revenue: {
    /** Sum of `total` across orders with paymentStatus = 'paid'. */
    totalPaid: number;
  };
}

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly storesService: StoresService,
    private readonly productsService: ProductsService,
    private readonly ordersService: OrdersService,
    private readonly notificationsService: NotificationsService,
    private readonly reviewsService: ReviewsService,
  ) {}

  // ---------------------------------------------------------------------
  // Users
  // ---------------------------------------------------------------------

  async listUsers(query: QueryAdminUsersDto): Promise<PaginatedResult<User>> {
    return this.usersService.list(query.page ?? 1, query.limit ?? 20, query.role);
  }

  async getUser(id: string): Promise<User> {
    return this.usersService.findById(id);
  }

  async suspendUser(id: string): Promise<User> {
    return this.usersService.suspend(id);
  }

  async unsuspendUser(id: string): Promise<User> {
    return this.usersService.unsuspend(id);
  }

  async changeUserRole(id: string, role: Role): Promise<User> {
    return this.usersService.updateRole(id, role);
  }

  /**
   * Blocks self-deletion and delegates the "last remaining admin" guard to
   * `UsersService.remove` itself (it already has the role-count context it
   * needs). Self-deletion specifically requires the *acting* admin's
   * identity, which only this call site has, so that check lives here.
   *
   * Everything is a soft delete: the user, then their reviews (so a removed
   * account's ratings stop counting). Orders keep showing who placed them.
   */
  async removeUser(id: string, actingAdmin: CurrentUserPayload): Promise<void> {
    if (actingAdmin.id === id) {
      throw new BadRequestException('You cannot delete your own admin account');
    }
    await this.usersService.remove(id);
    await this.reviewsService.removeAllByUser(id);
  }

  // ---------------------------------------------------------------------
  // Stores
  // ---------------------------------------------------------------------

  async listPendingStores(page: number, limit: number): Promise<PaginatedResult<Store>> {
    return this.storesService.listPendingApprovals(page, limit);
  }

  async approveStore(id: string): Promise<Store> {
    const store = await this.storesService.approve(id);
    await this.notifySeller(store, 'store.approved', `${store.name} is approved`,
      'Your store is live. Set it to open in your seller dashboard to start taking orders.');
    return store;
  }

  async rejectStore(id: string, reason: string): Promise<Store> {
    const store = await this.storesService.reject(id, reason);
    await this.notifySeller(store, 'store.rejected', `${store.name} was not approved`, `Reason: ${reason}`);
    return store;
  }

  async suspendStore(id: string): Promise<Store> {
    const store = await this.storesService.suspend(id);
    await this.notifySeller(store, 'store.suspended', `${store.name} has been suspended`,
      'Your store is hidden from shoppers. Contact support to find out more.');
    return store;
  }

  /** Best-effort: the moderation action already happened, a failed notification mustn't undo it. */
  private async notifySeller(store: Store, type: string, title: string, body: string): Promise<void> {
    try {
      await this.notificationsService.notify(store.sellerId, {
        type,
        title,
        body,
        metadata: { storeId: store.id },
      });
    } catch (err) {
      this.logger.error(`Failed to send ${type} notification for store ${store.id}`, err as Error);
    }
  }

  // ---------------------------------------------------------------------
  // Products
  // ---------------------------------------------------------------------

  async archiveProduct(id: string): Promise<void> {
    await this.productsService.adminArchive(id);
  }

  // ---------------------------------------------------------------------
  // Orders
  // ---------------------------------------------------------------------

  async listOrders(query: QueryOrdersDto): Promise<PaginatedResult<Order>> {
    return this.ordersService.findAllForAdmin(query);
  }

  // ---------------------------------------------------------------------
  // Analytics
  // ---------------------------------------------------------------------

  async getAnalyticsOverview(): Promise<AdminAnalyticsOverview> {
    const roles = Object.values(Role);
    const approvalStatuses = Object.values(StoreApprovalStatus);
    const productStatuses = Object.values(ProductStatus);
    const orderStatuses = Object.values(OrderStatus);

    const storeTypes = Object.values(StoreType);

    const [userCounts, storeCounts, storeTypeCounts, productCounts, orderCounts, totalRevenue] = await Promise.all([
      Promise.all(roles.map((role) => this.usersService.countByRole(role))),
      Promise.all(
        approvalStatuses.map((status) => this.storesService.countByApprovalStatus(status)),
      ),
      Promise.all(storeTypes.map((type) => this.storesService.countByStoreType(type))),
      Promise.all(productStatuses.map((status) => this.productsService.countByStatus(status))),
      Promise.all(orderStatuses.map((status) => this.ordersService.countByStatus(status))),
      this.ordersService.getTotalRevenue(),
    ]);

    const byRole = Object.fromEntries(roles.map((role, i) => [role, userCounts[i]])) as Record<
      Role,
      number
    >;
    const byApprovalStatus = Object.fromEntries(
      approvalStatuses.map((status, i) => [status, storeCounts[i]]),
    ) as Record<StoreApprovalStatus, number>;
    const byProductStatus = Object.fromEntries(
      productStatuses.map((status, i) => [status, productCounts[i]]),
    ) as Record<ProductStatus, number>;
    const byOrderStatus = Object.fromEntries(
      orderStatuses.map((status, i) => [status, orderCounts[i]]),
    ) as Record<OrderStatus, number>;

    return {
      users: {
        total: userCounts.reduce((sum, n) => sum + n, 0),
        byRole,
      },
      stores: {
        total: storeCounts.reduce((sum, n) => sum + n, 0),
        byApprovalStatus,
        byType: Object.fromEntries(storeTypes.map((type, i) => [type, storeTypeCounts[i]])) as Record<
          StoreType,
          number
        >,
      },
      products: {
        total: productCounts.reduce((sum, n) => sum + n, 0),
        byStatus: byProductStatus,
      },
      orders: {
        total: orderCounts.reduce((sum, n) => sum + n, 0),
        byStatus: byOrderStatus,
      },
      revenue: {
        totalPaid: totalRevenue,
      },
    };
  }
}
