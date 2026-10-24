export enum OrderStatus {
  NEW = 'new',
  PROCESSING = 'processing',
  PACKED = 'packed',
  SHIPPED = 'shipped',
  OUT_FOR_DELIVERY = 'out_for_delivery',
  DELIVERED = 'delivered',
  CANCELLED = 'cancelled',
  RETURNED = 'returned',
  REFUNDED = 'refunded',
}

export const ORDER_STATUS_FLOW: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.NEW]: [OrderStatus.PROCESSING, OrderStatus.CANCELLED],
  [OrderStatus.PROCESSING]: [OrderStatus.PACKED, OrderStatus.CANCELLED],
  // DELIVERED is reachable directly from PACKED for pickup orders, which skip
  // the delivery-only SHIPPED/OUT_FOR_DELIVERY hops (see seller-order-table.tsx's
  // `nextStatusOptions`, which only offers this edge when fulfillmentType is "pickup").
  [OrderStatus.PACKED]: [
    OrderStatus.SHIPPED,
    OrderStatus.OUT_FOR_DELIVERY,
    OrderStatus.DELIVERED,
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.SHIPPED]: [OrderStatus.OUT_FOR_DELIVERY, OrderStatus.DELIVERED],
  [OrderStatus.OUT_FOR_DELIVERY]: [OrderStatus.DELIVERED],
  [OrderStatus.DELIVERED]: [OrderStatus.RETURNED],
  [OrderStatus.CANCELLED]: [],
  [OrderStatus.RETURNED]: [OrderStatus.REFUNDED],
  [OrderStatus.REFUNDED]: [],
};

export enum FulfillmentType {
  PICKUP = 'pickup',
  DELIVERY = 'delivery',
}

export enum PaymentMethod {
  COD = 'cod',
  /** In-person payment for a POS/offline sale — distinct from COD, which implies a future delivery. */
  CASH = 'cash',
}

/** Where an order originated. `pos` orders are recorded by the seller for an
 * in-store sale — see OrdersService.createPosSale — and are created already
 * `delivered`/`paid` since there's no further fulfillment to track. */
export enum OrderChannel {
  ONLINE = 'online',
  POS = 'pos',
}

/** Pharmacy orders with prescription (Rx) items wait for the seller to check
 * the uploaded prescription before they can move past `new`. */
export enum PrescriptionStatus {
  NOT_REQUIRED = 'not_required',
  PENDING_REVIEW = 'pending_review',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export enum PaymentStatus {
  PENDING = 'pending',
  PAID = 'paid',
  FAILED = 'failed',
  REFUNDED = 'refunded',
}
