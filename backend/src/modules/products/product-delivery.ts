import { FulfillmentType } from '../../common/enums/order-status.enum';
import { DeliveryMode } from '../stores/entities/store-delivery-settings.entity';
import { ProductDeliveryType } from './entities/product.entity';

/**
 * How a product can actually be received. A store that offers only one
 * method applies it to every product; only a store offering both lets each
 * product pick its own. The product's saved `deliveryType` is left alone, so
 * it comes back into effect if the store offers both again.
 *
 * Mirrored by `effectiveDeliveryType` in the frontend
 * (features/products/delivery.ts), which drives the product page and checkout.
 */
export function effectiveDeliveryType(
  storeMode: DeliveryMode | null | undefined,
  productType: ProductDeliveryType | null | undefined,
): ProductDeliveryType {
  if (storeMode === DeliveryMode.PICKUP_ONLY) return ProductDeliveryType.PICKUP;
  if (storeMode === DeliveryMode.DELIVERY) return ProductDeliveryType.DELIVERY;
  return productType ?? ProductDeliveryType.BOTH;
}

export function allowsFulfillment(type: ProductDeliveryType, fulfillment: FulfillmentType): boolean {
  return type === ProductDeliveryType.BOTH || (type as string) === (fulfillment as string);
}
