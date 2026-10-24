import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { ProductsService } from '../products/products.service';
import { Product } from '../products/entities/product.entity';
import { ProductVariant } from '../products/entities/product-variant.entity';
import {
  purchaseBlockReason,
  resolveAddonSelection,
  SelectedAddon,
} from '../products/product-availability';
import { CartItem } from './entities/cart-item.entity';
import { AddToCartDto } from './dto/add-to-cart.dto';

export interface CartItemView {
  id: string;
  productId: string;
  variantId?: string | null;
  addonOptionIds: string[];
  /** Resolved against the product's current menu; prices are included in unitPrice. */
  addons: SelectedAddon[];
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  insufficientStock: boolean;
  /** null when the product doesn't track inventory (made-to-order). */
  availableStock: number | null;
  /** Why this line can't be checked out (sold out, expired, add-ons changed), or null. */
  unavailableReason: string | null;
  product: CartItem['product'];
  variant: CartItem['variant'];
  createdAt: Date;
  updatedAt: Date;
}

export interface CartView {
  items: CartItemView[];
  subtotal: number;
  hasInsufficientStock: boolean;
  hasUnavailableItems: boolean;
}

@Injectable()
export class CartService {
  constructor(
    @InjectRepository(CartItem)
    private readonly cartItemsRepository: Repository<CartItem>,
    private readonly productsService: ProductsService,
  ) {}

  // ---------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------

  async addItem(userId: string, dto: AddToCartDto): Promise<CartItem> {
    const product = await this.productsService.findById(dto.productId);
    const blockReason = purchaseBlockReason(product);
    if (blockReason) {
      throw new BadRequestException(blockReason);
    }

    const variant = this.resolveVariant(product.variants, dto.variantId);
    const availableStock = this.availableStock(product, variant);

    const { addons, error } = resolveAddonSelection(product, dto.addonOptionIds ?? []);
    if (error) {
      throw new BadRequestException(error);
    }
    const addonOptionIds = addons.map((addon) => addon.optionId);

    // Find-or-create at the application level rather than via a DB unique
    // constraint — see the comment on CartItem for why (NULL variantId
    // semantics under Postgres unique indexes). The add-on choice is part of
    // the line's identity, compared in its canonical (menu) order.
    const candidates = await this.cartItemsRepository.find({
      where: {
        userId,
        productId: dto.productId,
        variantId: dto.variantId ?? IsNull(),
        savedForLater: false,
      },
    });
    const existing = candidates.find(
      (row) => JSON.stringify(row.addonOptionIds ?? []) === JSON.stringify(addonOptionIds),
    );

    if (existing) {
      const newQuantity = existing.quantity + dto.quantity;
      this.assertStock(newQuantity, availableStock);
      existing.quantity = newQuantity;
      return this.cartItemsRepository.save(existing);
    }

    this.assertStock(dto.quantity, availableStock);

    const item = this.cartItemsRepository.create({
      userId,
      productId: dto.productId,
      variantId: dto.variantId ?? null,
      addonOptionIds,
      quantity: dto.quantity,
      savedForLater: false,
    });
    return this.cartItemsRepository.save(item);
  }

  async updateQuantity(userId: string, itemId: string, quantity: number): Promise<CartItem> {
    const item = await this.findOwned(itemId, userId);
    const product = await this.productsService.findById(item.productId);
    const variant = this.resolveVariant(product.variants, item.variantId ?? undefined);
    this.assertStock(quantity, this.availableStock(product, variant));

    item.quantity = quantity;
    return this.cartItemsRepository.save(item);
  }

  async removeItem(userId: string, itemId: string): Promise<void> {
    const item = await this.findOwned(itemId, userId);
    await this.cartItemsRepository.softRemove(item);
  }

  async toggleSaved(userId: string, itemId: string, savedForLater: boolean): Promise<CartItem> {
    const item = await this.findOwned(itemId, userId);
    item.savedForLater = savedForLater;
    return this.cartItemsRepository.save(item);
  }

  /** Removes all active (non-saved) items for a user. Called by the future
   * Orders module once an order has been successfully placed. */
  async clearCart(userId: string): Promise<void> {
    await this.cartItemsRepository.softDelete({ userId, savedForLater: false, deletedAt: IsNull() });
  }

  /** Removes a specific subset of a user's cart items (e.g. only the items
   * belonging to the store just checked out), leaving the rest of the cart
   * intact. Called by the Orders module after a successful checkout. */
  async removeItems(userId: string, itemIds: string[]): Promise<void> {
    if (itemIds.length === 0) {
      return;
    }
    await this.cartItemsRepository.softDelete({ userId, id: In(itemIds) });
  }

  // ---------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------

  async getCart(userId: string): Promise<CartView> {
    const rows = await this.cartItemsRepository.find({
      where: { userId, savedForLater: false },
      relations: ['product', 'product.variants', 'variant'],
      order: { createdAt: 'DESC' },
    });

    const items = rows.map((row) => this.toItemView(row));
    const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
    const hasInsufficientStock = items.some((item) => item.insufficientStock);
    const hasUnavailableItems = items.some((item) => item.unavailableReason !== null);

    return { items, subtotal, hasInsufficientStock, hasUnavailableItems };
  }

  async getSavedForLater(userId: string): Promise<CartItemView[]> {
    const rows = await this.cartItemsRepository.find({
      where: { userId, savedForLater: true },
      relations: ['product', 'product.variants', 'variant'],
      order: { createdAt: 'DESC' },
    });

    return rows.map((row) => this.toItemView(row));
  }

  async countItems(userId: string): Promise<number> {
    const result = await this.cartItemsRepository
      .createQueryBuilder('item')
      .select('COALESCE(SUM(item.quantity), 0)', 'total')
      .where('item.userId = :userId', { userId })
      .andWhere('item.savedForLater = false')
      .getRawOne<{ total: string }>();

    return parseInt(result?.total ?? '0', 10);
  }

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------

  private async findOwned(itemId: string, userId: string): Promise<CartItem> {
    const item = await this.cartItemsRepository.findOne({ where: { id: itemId } });
    if (!item) {
      throw new NotFoundException('Cart item not found');
    }
    if (item.userId !== userId) {
      throw new ForbiddenException('You do not have access to this cart item');
    }
    return item;
  }

  /** null = not tracked, i.e. unlimited. */
  private availableStock(
    product: Pick<Product, 'trackInventory' | 'stockQuantity'>,
    variant?: Pick<ProductVariant, 'stockQuantity'> | null,
  ): number | null {
    if (!product.trackInventory) {
      return null;
    }
    return variant ? variant.stockQuantity : product.stockQuantity;
  }

  private assertStock(quantity: number, availableStock: number | null): void {
    if (availableStock !== null && quantity > availableStock) {
      throw new BadRequestException(`Only ${availableStock} unit(s) available in stock`);
    }
  }

  private resolveVariant(
    variants: ProductVariant[] | undefined,
    variantId?: string,
  ): ProductVariant | undefined {
    if (!variantId) {
      return undefined;
    }
    const variant = (variants ?? []).find((v) => v.id === variantId);
    if (!variant) {
      throw new BadRequestException('Variant does not belong to this product');
    }
    return variant;
  }

  private toItemView(row: CartItem): CartItemView {
    const basePrice = row.product.discountPrice ?? row.product.price;
    const { addons, error: addonError } = resolveAddonSelection(row.product, row.addonOptionIds ?? []);
    const addonTotal = addons.reduce((sum, addon) => sum + addon.price, 0);
    const unitPrice = (row.variant ? basePrice + row.variant.priceDelta : basePrice) + addonTotal;
    const availableStock = this.availableStock(row.product, row.variant);

    return {
      id: row.id,
      productId: row.productId,
      variantId: row.variantId,
      addonOptionIds: row.addonOptionIds ?? [],
      addons,
      quantity: row.quantity,
      unitPrice,
      lineTotal: unitPrice * row.quantity,
      insufficientStock: availableStock !== null && row.quantity > availableStock,
      availableStock,
      unavailableReason:
        purchaseBlockReason(row.product) ??
        (addonError ? `${addonError}. Remove this item and add it again.` : null),
      product: row.product,
      variant: row.variant,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
