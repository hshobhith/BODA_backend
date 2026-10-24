import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { existsSync } from 'fs';
import { join } from 'path';
import { customAlphabet } from 'nanoid';
import PDFDocument from 'pdfkit';
import { PaginatedResult, paginate } from '../../common/utils/paginate.util';
import { Role } from '../../common/enums/role.enum';
import {
  FulfillmentType,
  ORDER_STATUS_FLOW,
  OrderChannel,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PrescriptionStatus,
} from '../../common/enums/order-status.enum';
import { StoresService } from '../stores/stores.service';
import { StoreApprovalStatus, StoreType } from '../stores/entities/store.entity';
import { DeliveryMode } from '../stores/entities/store-delivery-settings.entity';
import { ProductsService } from '../products/products.service';
import { isExpired } from '../products/product-availability';
import { allowsFulfillment, effectiveDeliveryType } from '../products/product-delivery';
import { CartService, CartItemView } from '../cart/cart.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UploadsService } from '../uploads/uploads.service';
import { Address } from '../addresses/entities/address.entity';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { OrderStatusHistory } from './entities/order-status-history.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { CreatePosSaleDto } from './dto/create-pos-sale.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { QueryOrdersDto } from './dto/query-orders.dto';
import { ReviewPrescriptionDto } from './dto/review-prescription.dto';

/** MVP: no GST/tax computation yet. Kept as a constant so wiring in a real
 * rate later is a one-line change; every order still carries a `tax` field. */
const TAX_RATE = 0;

/** Copied into dist/ by nest-cli's `assets` config (src/assets/brand/boda-logo.png). */
const INVOICE_LOGO_PATH = join(__dirname, '..', '..', 'assets', 'brand', 'boda-logo.png');

const ORDER_NUMBER_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const generateOrderSuffix = customAlphabet(ORDER_NUMBER_ALPHABET, 6);

interface StockShortfall {
  productId: string;
  variantId?: string | null;
  name: string;
  requested: number;
  available: number;
}

interface DecrementedItem {
  productId: string;
  variantId?: string;
  quantity: number;
}

// Order reads pass `withDeleted: true` so a deleted customer or delivery
// address still shows on the orders that reference it.
const ORDER_RELATIONS = [
  'items',
  'items.product',
  'items.variant',
  'customer',
  'store',
  'deliveryAddress',
];

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Customer-facing wording for a status; restaurants use kitchen terms. */
function statusLabel(status: OrderStatus, storeType?: StoreType): string {
  if (storeType === StoreType.RESTAURANT) {
    if (status === OrderStatus.PROCESSING) return 'being prepared';
    if (status === OrderStatus.PACKED) return 'ready';
  }
  return status.replace(/_/g, ' ');
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectRepository(Order)
    private readonly ordersRepository: Repository<Order>,
    @InjectRepository(OrderStatusHistory)
    private readonly statusHistoryRepository: Repository<OrderStatusHistory>,
    @InjectRepository(Address)
    private readonly addressesRepository: Repository<Address>,
    private readonly storesService: StoresService,
    private readonly productsService: ProductsService,
    private readonly cartService: CartService,
    private readonly notificationsService: NotificationsService,
    private readonly uploadsService: UploadsService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  // ---------------------------------------------------------------------
  // Checkout
  // ---------------------------------------------------------------------

  async create(customerId: string, dto: CreateOrderDto): Promise<Order> {
    const store = await this.storesService.findById(dto.storeId);
    if (store.approvalStatus !== StoreApprovalStatus.APPROVED) {
      throw new BadRequestException('This store is not currently accepting orders');
    }
    if (!this.storesService.isStoreOpenNow(store)) {
      throw new BadRequestException(`${store.name} is closed right now and isn't taking orders`);
    }

    const deliverySettings = store.deliverySettings;

    if (dto.fulfillmentType === FulfillmentType.DELIVERY) {
      if (
        !deliverySettings ||
        ![DeliveryMode.DELIVERY, DeliveryMode.BOTH].includes(deliverySettings.mode)
      ) {
        throw new BadRequestException('This store does not support delivery orders');
      }
      if (!dto.deliveryAddressId) {
        throw new BadRequestException('deliveryAddressId is required for delivery orders');
      }
      const address = await this.addressesRepository.findOne({
        where: { id: dto.deliveryAddressId },
      });
      if (!address || address.userId !== customerId) {
        throw new BadRequestException('Delivery address not found');
      }
    } else if (
      !deliverySettings ||
      ![DeliveryMode.PICKUP_ONLY, DeliveryMode.BOTH].includes(deliverySettings.mode)
    ) {
      throw new BadRequestException('This store does not support pickup orders');
    }

    const cart = await this.cartService.getCart(customerId);
    const itemsForStore = cart.items.filter((item) => item.product.storeId === dto.storeId);
    if (itemsForStore.length === 0) {
      throw new BadRequestException('Cart is empty for this store');
    }

    const unavailable = itemsForStore.filter((item) => item.unavailableReason);
    if (unavailable.length > 0) {
      throw new BadRequestException(unavailable.map((item) => item.unavailableReason).join('; '));
    }

    // When the store offers both, each product can still be pickup- or delivery-only.
    const wrongMethod = itemsForStore.filter(
      (item) =>
        !allowsFulfillment(
          effectiveDeliveryType(deliverySettings?.mode, item.product.deliveryType),
          dto.fulfillmentType,
        ),
    );
    if (wrongMethod.length > 0) {
      const names = wrongMethod.map((item) => item.product.name).join(', ');
      const other = dto.fulfillmentType === FulfillmentType.DELIVERY ? 'pickup' : 'delivery';
      throw new BadRequestException(`${names} can only be ordered for ${other}`);
    }

    const needsPrescription = itemsForStore.some((item) => item.product.requiresPrescription);
    const prescriptionKeys = needsPrescription ? dto.prescriptionKeys ?? [] : [];
    if (needsPrescription) {
      if (prescriptionKeys.length === 0) {
        throw new BadRequestException('Upload a prescription to order prescription medicines');
      }
      if (prescriptionKeys.some((key) => !this.uploadsService.isOwnPrescriptionKey(key, customerId))) {
        throw new BadRequestException('Invalid prescription file — upload it again');
      }
    }

    // Never trust the cart's cached `insufficientStock` flag — re-check
    // live stock right before writing anything.
    const shortfalls = await this.checkLiveStock(itemsForStore);
    if (shortfalls.length > 0) {
      throw new BadRequestException({
        message: 'Insufficient stock for one or more items',
        items: shortfalls,
      });
    }

    const subtotal = round2(itemsForStore.reduce((sum, item) => sum + item.lineTotal, 0));

    let deliveryFee = 0;
    if (dto.fulfillmentType === FulfillmentType.DELIVERY && deliverySettings) {
      const threshold = deliverySettings.freeDeliveryThreshold;
      const waived = threshold != null && subtotal >= threshold;
      deliveryFee = waived ? 0 : deliverySettings.deliveryFee ?? 0;
    }

    const tax = round2(subtotal * TAX_RATE);
    const discount = 0;
    const total = round2(subtotal + deliveryFee + tax - discount);

    // `ProductsService.adjustStock` is its own atomic, race-free operation
    // but it commits through the shared connection pool rather than a
    // manager we control, so it cannot participate in the transaction
    // below. We decrement first (compensating with a restock if a later
    // item in the batch or the order-row write itself fails) instead of
    // reimplementing the stock arithmetic here.
    const decremented: DecrementedItem[] = [];
    try {
      for (const item of itemsForStore) {
        if (!item.product.trackInventory) {
          continue;
        }
        await this.productsService.adjustStock(
          item.productId,
          item.variantId ?? undefined,
          -item.quantity,
          'order_placed',
        );
        decremented.push({
          productId: item.productId,
          variantId: item.variantId ?? undefined,
          quantity: item.quantity,
        });
      }
    } catch (err) {
      await this.compensateRestock(decremented, 'order_placed_failed');
      throw err;
    }

    let order: Order;
    try {
      order = await this.dataSource.transaction(async (manager) => {
        const orderNumber = await this.generateUniqueOrderNumber(manager);

        const entity = manager.create(Order, {
          orderNumber,
          customerId,
          storeId: dto.storeId,
          status: OrderStatus.NEW,
          fulfillmentType: dto.fulfillmentType,
          deliveryAddressId:
            dto.fulfillmentType === FulfillmentType.DELIVERY ? dto.deliveryAddressId : null,
          subtotal,
          deliveryFee,
          discount,
          tax,
          total,
          paymentMethod: PaymentMethod.COD,
          paymentStatus: PaymentStatus.PENDING,
          customerNote: dto.customerNote,
          prescriptionStatus: needsPrescription
            ? PrescriptionStatus.PENDING_REVIEW
            : PrescriptionStatus.NOT_REQUIRED,
          prescriptionKeys,
          placedAt: new Date(),
          items: itemsForStore.map((item) =>
            manager.create(OrderItem, {
              productId: item.productId,
              variantId: item.variantId ?? null,
              productNameSnapshot: item.product.name,
              addons: item.addons.map(({ groupName, name, price }) => ({ groupName, name, price })),
              stockDeducted: item.product.trackInventory,
              quantity: item.quantity,
              unitPrice: round2(item.unitPrice),
              total: round2(item.lineTotal),
            }),
          ),
        });

        const saved = await manager.save(entity);

        await manager.save(
          manager.create(OrderStatusHistory, {
            orderId: saved.id,
            status: OrderStatus.NEW,
            note: 'Order placed',
            changedById: customerId,
          }),
        );

        return saved;
      });
    } catch (err) {
      await this.compensateRestock(decremented, 'order_placed_failed');
      throw err;
    }

    // Clearing the cart is best-effort: the order is already durable, so a
    // failure here must never look like a failed checkout to the customer.
    try {
      await this.cartService.removeItems(
        customerId,
        itemsForStore.map((item) => item.id),
      );
    } catch (err) {
      this.logger.error(`Failed to clear checked-out cart items for order ${order.id}`, err as Error);
    }

    // Notifications fire only after a successful commit, and never roll
    // back a real order if they fail.
    try {
      await this.notificationsService.notify(customerId, {
        type: 'order.placed',
        title: 'Order placed',
        body: `Your order ${order.orderNumber} has been placed successfully.`,
        metadata: { orderId: order.id, orderNumber: order.orderNumber },
      });
      await this.notificationsService.notify(store.sellerId, {
        type: 'order.received',
        title: 'New order received',
        body: needsPrescription
          ? `You have a new order ${order.orderNumber}. Check the prescription to accept it.`
          : `You have a new order ${order.orderNumber}.`,
        metadata: { orderId: order.id, orderNumber: order.orderNumber },
      });
    } catch (err) {
      this.logger.error(`Failed to send order-placed notifications for order ${order.id}`, err as Error);
    }

    return this.findById(order.id);
  }

  /**
   * Records an in-person sale a seller made outside the app (a walk-in
   * customer at the counter). This reuses the normal order pipeline instead
   * of a parallel model — decrementing stock through `ProductsService.adjustStock`,
   * tagging the order `channel: pos`, and creating it already `delivered`/`paid`
   * since there's no further fulfillment to track. That means it shows up in
   * revenue analytics and gets a real PDF invoice for free, exactly like an
   * online order.
   */
  async createPosSale(sellerId: string, storeId: string, dto: CreatePosSaleDto): Promise<Order> {
    const store = await this.storesService.findMineById(storeId, sellerId);

    interface PosLineItem {
      productId: string;
      variantId?: string;
      name: string;
      unitPrice: number;
      quantity: number;
      trackInventory: boolean;
    }

    const lineItems: PosLineItem[] = [];
    for (const item of dto.items) {
      const product = await this.productsService.findById(item.productId);
      if (product.storeId !== store.id) {
        throw new BadRequestException(`Product ${item.productId} does not belong to this store`);
      }
      if (isExpired(product)) {
        throw new BadRequestException(`"${product.name}" has expired and can't be sold`);
      }

      let unitPrice = product.discountPrice ?? product.price;
      let available = product.stockQuantity;

      if (item.variantId) {
        const variant = product.variants.find((v) => v.id === item.variantId);
        if (!variant) {
          throw new BadRequestException(
            `Variant ${item.variantId} not found for product ${item.productId}`,
          );
        }
        unitPrice += variant.priceDelta;
        available = variant.stockQuantity;
      }

      if (product.trackInventory && item.quantity > available) {
        throw new BadRequestException(
          `Insufficient stock for "${product.name}" — requested ${item.quantity}, available ${available}`,
        );
      }

      lineItems.push({
        productId: item.productId,
        variantId: item.variantId,
        name: product.name,
        unitPrice,
        quantity: item.quantity,
        trackInventory: product.trackInventory,
      });
    }

    const subtotal = round2(lineItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0));

    // Same decrement-first-and-compensate approach as `create()` — see the
    // comment there for why this can't run inside the transaction below.
    const decremented: DecrementedItem[] = [];
    try {
      for (const item of lineItems.filter((line) => line.trackInventory)) {
        await this.productsService.adjustStock(item.productId, item.variantId, -item.quantity, 'pos_sale');
        decremented.push({
          productId: item.productId,
          variantId: item.variantId,
          quantity: item.quantity,
        });
      }
    } catch (err) {
      await this.compensateRestock(decremented, 'pos_sale_failed');
      throw err;
    }

    let order: Order;
    try {
      order = await this.dataSource.transaction(async (manager) => {
        const orderNumber = await this.generateUniqueOrderNumber(manager);

        const entity = manager.create(Order, {
          orderNumber,
          customerId: null,
          guestName: dto.guestName,
          guestPhone: dto.guestPhone,
          storeId: store.id,
          channel: OrderChannel.POS,
          status: OrderStatus.DELIVERED,
          fulfillmentType: FulfillmentType.PICKUP,
          subtotal,
          deliveryFee: 0,
          discount: 0,
          tax: 0,
          total: subtotal,
          paymentMethod: PaymentMethod.CASH,
          paymentStatus: PaymentStatus.PAID,
          customerNote: dto.note,
          placedAt: new Date(),
          items: lineItems.map((item) =>
            manager.create(OrderItem, {
              productId: item.productId,
              variantId: item.variantId ?? null,
              productNameSnapshot: item.name,
              stockDeducted: item.trackInventory,
              quantity: item.quantity,
              unitPrice: round2(item.unitPrice),
              total: round2(item.unitPrice * item.quantity),
            }),
          ),
        });

        const saved = await manager.save(entity);

        await manager.save(
          manager.create(OrderStatusHistory, {
            orderId: saved.id,
            status: OrderStatus.DELIVERED,
            note: 'Recorded as an in-store sale',
            changedById: sellerId,
          }),
        );

        return saved;
      });
    } catch (err) {
      await this.compensateRestock(decremented, 'pos_sale_failed');
      throw err;
    }

    return this.findById(order.id);
  }

  private async checkLiveStock(items: CartItemView[]): Promise<StockShortfall[]> {
    const shortfalls: StockShortfall[] = [];
    for (const item of items) {
      const product = await this.productsService.findById(item.productId);
      if (!product.trackInventory) {
        continue;
      }
      const available = item.variantId
        ? product.variants.find((v) => v.id === item.variantId)?.stockQuantity ?? 0
        : product.stockQuantity;

      if (item.quantity > available) {
        shortfalls.push({
          productId: item.productId,
          variantId: item.variantId,
          name: product.name,
          requested: item.quantity,
          available,
        });
      }
    }
    return shortfalls;
  }

  private async compensateRestock(items: DecrementedItem[], reason: string): Promise<void> {
    for (const item of items) {
      try {
        await this.productsService.adjustStock(item.productId, item.variantId, item.quantity, reason);
      } catch (err) {
        this.logger.error(
          `Failed to compensate-restock product ${item.productId} (variant ${item.variantId ?? 'none'})`,
          err as Error,
        );
      }
    }
  }

  private async generateUniqueOrderNumber(manager: EntityManager): Promise<string> {
    const now = new Date();
    const datePart = `${String(now.getFullYear()).slice(-2)}${String(now.getMonth() + 1).padStart(
      2,
      '0',
    )}${String(now.getDate()).padStart(2, '0')}`;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = `BODA-${datePart}-${generateOrderSuffix()}`;
      const existing = await manager.findOne(Order, { where: { orderNumber: candidate } });
      if (!existing) {
        return candidate;
      }
    }

    throw new Error('Failed to generate a unique order number after several attempts');
  }

  // ---------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------

  async findById(orderId: string): Promise<Order> {
    const order = await this.ordersRepository.findOne({
      where: { id: orderId },
      relations: ORDER_RELATIONS,
      withDeleted: true,
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    return order;
  }

  /** Ownership-aware fetch: customers see only their own orders, sellers
   * only orders against their store, admins see everything. Throws
   * NotFoundException (never Forbidden) for unauthorized access so we
   * don't leak whether an order id exists. */
  async findByIdForUser(orderId: string, userId: string, role: Role): Promise<Order> {
    const order = await this.findById(orderId);

    if (role === Role.ADMIN) {
      return order;
    }
    if (role === Role.CUSTOMER && order.customerId === userId) {
      return order;
    }
    if (role === Role.SELLER && order.store.sellerId === userId) {
      return order;
    }

    throw new NotFoundException('Order not found');
  }

  async findMineAsCustomer(
    customerId: string,
    query: QueryOrdersDto,
  ): Promise<PaginatedResult<Order>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Record<string, unknown> = { customerId };
    if (query.status) {
      where.status = query.status;
    }
    // A store's private link (store-only mode) lists just that store's orders.
    if (query.storeId) {
      where.storeId = query.storeId;
    }

    const [data, total] = await this.ordersRepository.findAndCount({
      where,
      relations: ['items', 'store'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return paginate(data, total, page, limit);
  }

  /**
   * `query.storeId` narrows to one owned store; omitted, this aggregates
   * across every store the seller owns (a seller can own more than one).
   */
  async findMineAsSeller(sellerId: string, query: QueryOrdersDto): Promise<PaginatedResult<Order>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    let storeIds: string[];
    if (query.storeId) {
      const store = await this.storesService.findMineById(query.storeId, sellerId);
      storeIds = [store.id];
    } else {
      const stores = await this.storesService.findAllMine(sellerId);
      if (stores.length === 0) {
        throw new NotFoundException('You do not have a store yet');
      }
      storeIds = stores.map((s) => s.id);
    }

    const where: Record<string, unknown> = { storeId: In(storeIds) };
    if (query.status) {
      where.status = query.status;
    }

    const [data, total] = await this.ordersRepository.findAndCount({
      where,
      relations: ['items', 'customer', 'store'],
      withDeleted: true,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return paginate(data, total, page, limit);
  }

  // ---------------------------------------------------------------------
  // Status transitions
  // ---------------------------------------------------------------------

  async updateStatus(
    orderId: string,
    actorId: string,
    actorRole: Role,
    dto: UpdateOrderStatusDto,
  ): Promise<Order> {
    const order = await this.findById(orderId);

    const isAdmin = actorRole === Role.ADMIN;
    const isOwningSeller = actorRole === Role.SELLER && order.store.sellerId === actorId;
    const isOwningCustomer = actorRole === Role.CUSTOMER && order.customerId === actorId;

    if (!isAdmin && !isOwningSeller && !isOwningCustomer) {
      // Hide existence from unrelated actors, same rationale as findByIdForUser.
      throw new NotFoundException('Order not found');
    }

    if (isOwningCustomer) {
      // A kitchen has already started cooking once an order is being prepared.
      const isRestaurant = order.store.storeType === StoreType.RESTAURANT;
      const cancellable = isRestaurant
        ? [OrderStatus.NEW]
        : [OrderStatus.NEW, OrderStatus.PROCESSING];
      const customerMayCancel = dto.status === OrderStatus.CANCELLED && cancellable.includes(order.status);
      if (!customerMayCancel) {
        throw new ForbiddenException(
          isRestaurant
            ? 'Restaurant orders can only be cancelled before the kitchen starts preparing them'
            : 'Customers may only cancel an order while it is new or processing',
        );
      }
    }

    // Rejected too: rejecting is two writes (mark rejected, then cancel), so if
    // the cancel ever failed the order must still be unable to move forward.
    if (
      (order.prescriptionStatus === PrescriptionStatus.PENDING_REVIEW ||
        order.prescriptionStatus === PrescriptionStatus.REJECTED) &&
      dto.status !== OrderStatus.CANCELLED
    ) {
      throw new BadRequestException(
        order.prescriptionStatus === PrescriptionStatus.REJECTED
          ? 'This order’s prescription was rejected, so it can only be cancelled'
          : 'Review the prescription before accepting this order',
      );
    }

    const allowedNext = ORDER_STATUS_FLOW[order.status] ?? [];
    if (!allowedNext.includes(dto.status)) {
      throw new BadRequestException(
        `Cannot transition order from "${order.status}" to "${dto.status}"`,
      );
    }

    const shouldRestock = dto.status === OrderStatus.CANCELLED || dto.status === OrderStatus.RETURNED;
    const restockReason = dto.status === OrderStatus.CANCELLED ? 'order_cancelled' : 'order_returned';

    order.status = dto.status;
    if (dto.status === OrderStatus.DELIVERED) {
      order.paymentStatus = PaymentStatus.PAID;
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.save(Order, order);
      await manager.save(
        OrderStatusHistory,
        manager.create(OrderStatusHistory, {
          orderId: order.id,
          status: dto.status,
          note: dto.note,
          changedById: actorId,
        }),
      );
    });

    if (shouldRestock) {
      for (const item of order.items.filter((orderItem) => orderItem.stockDeducted)) {
        try {
          await this.productsService.adjustStock(
            item.productId,
            item.variantId ?? undefined,
            item.quantity,
            restockReason,
          );
        } catch (err) {
          this.logger.error(
            `Failed to restock product ${item.productId} for order ${order.id} (${restockReason})`,
            err as Error,
          );
        }
      }
    }

    // Tell the other party: a customer's own cancellation goes to the seller,
    // every other change goes to the customer (POS orders have none).
    try {
      if (isOwningCustomer) {
        await this.notificationsService.notify(order.store.sellerId, {
          type: 'order.cancelled_by_customer',
          title: `Order ${order.orderNumber} cancelled`,
          body: `The customer cancelled order ${order.orderNumber}.`,
          metadata: { orderId: order.id, status: dto.status },
        });
      } else if (order.customerId) {
        await this.notificationsService.notify(order.customerId, {
          type: 'order.status_changed',
          title: `Order ${order.orderNumber} updated`,
          body: `Your order is now ${statusLabel(dto.status, order.store.storeType)}.`,
          metadata: { orderId: order.id, status: dto.status },
        });
      }
    } catch (err) {
      this.logger.error(`Failed to send status-change notification for order ${order.id}`, err as Error);
    }

    return this.findById(order.id);
  }

  // ---------------------------------------------------------------------
  // Prescriptions (pharmacy orders with Rx items)
  // ---------------------------------------------------------------------

  /**
   * The owning seller (or an admin) checks the uploaded prescription.
   * Approving unblocks the normal status flow; rejecting cancels the order
   * through `updateStatus`, so stock is restored and the customer notified.
   */
  async reviewPrescription(
    orderId: string,
    actorId: string,
    actorRole: Role,
    dto: ReviewPrescriptionDto,
  ): Promise<Order> {
    const order = await this.findById(orderId);

    const isAdmin = actorRole === Role.ADMIN;
    const isOwningSeller = actorRole === Role.SELLER && order.store.sellerId === actorId;
    if (!isAdmin && !isOwningSeller) {
      throw new NotFoundException('Order not found');
    }
    if (order.prescriptionStatus !== PrescriptionStatus.PENDING_REVIEW) {
      throw new BadRequestException('This order has no prescription waiting for review');
    }

    const note = dto.note?.trim() || null;
    if (!dto.approve && !note) {
      throw new BadRequestException('Tell the customer why the prescription was rejected');
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.update(Order, order.id, {
        prescriptionStatus: dto.approve ? PrescriptionStatus.APPROVED : PrescriptionStatus.REJECTED,
        prescriptionNote: note,
      });
      if (dto.approve) {
        await manager.save(
          manager.create(OrderStatusHistory, {
            orderId: order.id,
            status: order.status,
            note: note ? `Prescription approved: ${note}` : 'Prescription approved',
            changedById: actorId,
          }),
        );
      }
    });

    if (!dto.approve) {
      return this.updateStatus(order.id, actorId, actorRole, {
        status: OrderStatus.CANCELLED,
        note: `Prescription rejected: ${note}`,
      });
    }

    if (order.customerId) {
      try {
        await this.notificationsService.notify(order.customerId, {
          type: 'order.prescription_approved',
          title: `Order ${order.orderNumber} updated`,
          body: 'Your prescription was approved. The pharmacy is preparing your order.',
          metadata: { orderId: order.id },
        });
      } catch (err) {
        this.logger.error(`Failed to send prescription-approved notification for order ${order.id}`, err as Error);
      }
    }

    return this.findById(order.id);
  }

  async readPrescription(order: Order, index: number): Promise<{ body: Buffer; contentType: string }> {
    const key = order.prescriptionKeys?.[index];
    if (!key) {
      throw new NotFoundException('Prescription not found');
    }
    try {
      return await this.uploadsService.readPrivate(key);
    } catch (err) {
      this.logger.error(`Failed to read prescription ${index} for order ${order.id}`, err as Error);
      throw new NotFoundException('Prescription file is missing');
    }
  }

  // ---------------------------------------------------------------------
  // Admin-facing (called directly by the Admin module's service layer)
  // ---------------------------------------------------------------------

  /** Platform-wide order listing, no ownership restriction. */
  async findAllForAdmin(query: QueryOrdersDto): Promise<PaginatedResult<Order>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Record<string, unknown> = {};
    if (query.status) {
      where.status = query.status;
    }
    if (query.storeId) {
      where.storeId = query.storeId;
    }

    const [data, total] = await this.ordersRepository.findAndCount({
      where,
      relations: ['items', 'store', 'customer'],
      withDeleted: true,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return paginate(data, total, page, limit);
  }

  async countByStatus(status: OrderStatus): Promise<number> {
    return this.ordersRepository.count({ where: { status } });
  }

  /** Sum of `total` across paid orders, for the admin analytics overview. */
  async getTotalRevenue(): Promise<number> {
    const result = await this.ordersRepository
      .createQueryBuilder('order')
      .select('SUM(order.total)', 'sum')
      .where('order.paymentStatus = :paymentStatus', { paymentStatus: PaymentStatus.PAID })
      .getRawOne<{ sum: string | null }>();

    return Number(result?.sum ?? 0);
  }

  async getTimeline(orderId: string): Promise<OrderStatusHistory[]> {
    return this.statusHistoryRepository.find({
      where: { orderId },
      relations: ['changedBy'],
      withDeleted: true,
      order: { createdAt: 'ASC' },
    });
  }

  // ---------------------------------------------------------------------
  // Invoice PDF
  // ---------------------------------------------------------------------

  async generateInvoicePdf(orderId: string): Promise<Buffer> {
    const order = await this.findById(orderId);

    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header — falls back to the plain name if the logo asset is missing.
      if (existsSync(INVOICE_LOGO_PATH)) {
        doc.image(INVOICE_LOGO_PATH, 50, 45, { height: 34 });
        doc.y = 45 + 34 + 6;
      } else {
        doc.fontSize(22).fillColor('#111').text('BODA', { continued: false });
      }
      doc.fontSize(10).fillColor('#666').text('Local Marketplace Invoice', 50);
      doc.moveDown(1.5);

      const paymentMethodLabel = order.paymentMethod === PaymentMethod.CASH ? 'Cash (in-store)' : 'Cash on Delivery';

      doc.fontSize(14).fillColor('#111').text(`Invoice — Order ${order.orderNumber}`);
      doc
        .fontSize(10)
        .fillColor('#444')
        .text(`Order date: ${order.placedAt.toDateString()}`)
        .text(`Status: ${order.status}`)
        .text(`Payment method: ${paymentMethodLabel}`)
        .text(`Payment status: ${order.paymentStatus}`);
      doc.moveDown();

      // Store / customer columns
      const colTop = doc.y;
      doc.fontSize(11).fillColor('#111').text('Sold by', 50, colTop);
      doc
        .fontSize(10)
        .fillColor('#444')
        .text(order.store.name, 50)
        .text(order.store.addressLine, 50)
        .text(`${order.store.city}, ${order.store.state} ${order.store.pincode}`, 50)
        .text(order.store.phone, 50);

      const billToName = order.customer?.fullName ?? order.guestName ?? 'Walk-in customer';

      doc.fontSize(11).fillColor('#111').text('Bill to', 320, colTop);
      doc.fontSize(10).fillColor('#444').text(billToName, 320);
      if (order.fulfillmentType === FulfillmentType.DELIVERY && order.deliveryAddress) {
        const addr = order.deliveryAddress;
        doc.text(`${addr.line1}${addr.line2 ? ', ' + addr.line2 : ''}`, 320);
        doc.text(`${addr.city}, ${addr.state} ${addr.pincode}`, 320);
      } else {
        doc.text('Pickup at store', 320);
      }

      doc.moveDown(2);

      // Items table
      const tableTop = doc.y;
      const cols = { name: 50, qty: 300, price: 370, total: 460 };

      doc.fontSize(10).fillColor('#111');
      doc.text('Item', cols.name, tableTop, { bold: true } as any);
      doc.text('Qty', cols.qty, tableTop);
      doc.text('Unit Price', cols.price, tableTop);
      doc.text('Line Total', cols.total, tableTop);
      doc
        .moveTo(50, tableTop + 15)
        .lineTo(545, tableTop + 15)
        .strokeColor('#ccc')
        .stroke();

      let y = tableTop + 22;
      doc.fillColor('#333').fontSize(10);
      for (const item of order.items) {
        const addons = item.addons ?? [];
        const itemLabel = addons.length
          ? `${item.productNameSnapshot} (+ ${addons.map((addon) => addon.name).join(', ')})`
          : item.productNameSnapshot;
        doc.text(itemLabel, cols.name, y, { width: 240 });
        doc.text(String(item.quantity), cols.qty, y);
        doc.text(`Rs. ${item.unitPrice.toFixed(2)}`, cols.price, y);
        doc.text(`Rs. ${item.total.toFixed(2)}`, cols.total, y);
        y += Math.max(20, doc.heightOfString(itemLabel, { width: 240 }) + 6);
      }

      doc
        .moveTo(50, y + 4)
        .lineTo(545, y + 4)
        .strokeColor('#ccc')
        .stroke();
      y += 14;

      const summaryLine = (label: string, value: number) => {
        doc.fontSize(10).fillColor('#444').text(label, 370, y);
        doc.text(`Rs. ${value.toFixed(2)}`, 460, y);
        y += 16;
      };

      summaryLine('Subtotal', order.subtotal);
      summaryLine('Delivery fee', order.deliveryFee);
      summaryLine('Tax', order.tax);
      summaryLine('Discount', -order.discount);

      doc
        .moveTo(370, y + 2)
        .lineTo(545, y + 2)
        .strokeColor('#999')
        .stroke();
      y += 10;

      doc.fontSize(12).fillColor('#111').text('Total', 370, y);
      doc.text(`Rs. ${order.total.toFixed(2)}`, 460, y);

      doc
        .fontSize(8)
        .fillColor('#999')
        .text(
          'This is a system-generated invoice from BODA. Thank you for shopping local.',
          50,
          770,
          { align: 'center', width: 495 },
        );

      doc.end();
    });
  }
}
