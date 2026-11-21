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
import { QueryAdminStoresDto } from './dto/query-admin-stores.dto';
import { AdminCreateStoreDto } from './dto/admin-create-store.dto';
import { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { AuthService } from '../auth/auth.service';
import { AdminStoreListItem } from '../stores/stores.service';

export interface AdminCreatedStore extends Store {
  /** What happened to the seller account the store was given to. */
  sellerAccount: {
    id: string;
    email: string;
    /** Account not claimed yet; the seller was emailed to sign in with Google. */
    invited: boolean;
    /** Existing customer account, now a seller. */
    upgraded: boolean;
  };
}

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
    private readonly authService: AuthService,
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

  async listAllStores(query: QueryAdminStoresDto): Promise<PaginatedResult<AdminStoreListItem>> {
    return this.storesService.listAllForAdmin(query.page ?? 1, query.limit ?? 20, {
      search: query.search,
      approvalStatus: query.approvalStatus,
    });
  }

  /**
   * Sets up a store for a seller, identified by email. The store belongs to
   * that seller's account from the start (created and invited if it doesn't
   * exist yet — see `AuthService.findOrCreateSellerForStore`), so when they
   * sign in with that email they see and manage it exactly like a store they
   * registered themselves. It starts approved; the admin can keep filling in
   * hours, delivery and products through the seller endpoints with `storeId`.
   */
  async createStoreForSeller(dto: AdminCreateStoreDto): Promise<AdminCreatedStore> {
    const { sellerEmail, sellerName, sellerPhone, ...storeDto } = dto;
    const account = await this.authService.findOrCreateSellerForStore({
      email: sellerEmail,
      fullName: sellerName,
      phone: sellerPhone,
    });
    const store = await this.storesService.createForSellerByAdmin(account.user.id, storeDto);

    // An account nobody has claimed yet (new, or invited earlier for another
    // store) is emailed to sign in with Google; a real seller gets a notification.
    const invited = this.authService.isUnclaimedInvite(account.user);
    if (invited) {
      await this.authService.sendSellerInvite(account.user, store.name);
    } else {
      await this.notifySeller(
        store,
        'store.created-by-admin',
        `${store.name} has been added to your account`,
        'BODA has set up this store for you. Find it in your seller dashboard — you can edit its details, hours, delivery settings and products there.',
      );
    }

    return {
      ...store,
      sellerAccount: {
        id: account.user.id,
        email: account.user.email,
        invited,
        upgraded: account.upgraded,
      },
    };
  }

  /** One store, any approval status, with its seller — the admin "manage store" header. */
  async getStore(id: string): Promise<AdminStoreListItem> {
    const store = await this.storesService.findById(id);
    const seller = await this.usersService.findById(store.sellerId);
    return {
      ...store,
      seller: {
        id: seller.id,
        fullName: seller.fullName,
        email: seller.email,
        hasSignedIn: !this.authService.isUnclaimedInvite(seller),
      },
    };
  }

  /** Re-sends the "your store is ready" email to a seller who hasn't signed in yet. */
  async resendSellerInvite(storeId: string): Promise<{ sent: true; email: string }> {
    const store = await this.storesService.findById(storeId);
    const seller = await this.usersService.findById(store.sellerId);
    if (!this.authService.isUnclaimedInvite(seller)) {
      throw new BadRequestException('This seller has already signed in — no invite needed.');
    }
    await this.authService.sendSellerInvite(seller, store.name);
    return { sent: true, email: seller.email };
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
