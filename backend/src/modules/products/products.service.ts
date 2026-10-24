import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository, SelectQueryBuilder } from 'typeorm';
import { nanoid } from 'nanoid';
import slugify from 'slugify';
import { v4 as uuidv4 } from 'uuid';
import { PaginatedResult, paginate } from '../../common/utils/paginate.util';
import { StoresService } from '../stores/stores.service';
import { StoreApprovalStatus } from '../stores/entities/store.entity';
import { storeDistanceKmSql } from '../stores/store-distance';
import { CategoriesService } from '../categories/categories.service';
import { Product, ProductAddonGroup, ProductStatus } from './entities/product.entity';
import { ProductImage } from './entities/product-image.entity';
import { ProductVideo } from './entities/product-video.entity';
import { ProductVariant } from './entities/product-variant.entity';
import { InventoryHistory } from './entities/inventory-history.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { ProductAddonGroupDto } from './dto/product-addon.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { DuplicateProductDto } from './dto/duplicate-product.dto';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { QueryProductsDto, ProductSortBy } from './dto/query-products.dto';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Partial unique index on (storeId, barcode) for active products — see Product entity. */
const STORE_BARCODE_UNIQUE = 'UQ_products_store_active_barcode';

/** Blank barcodes are stored as NULL so the per-store uniqueness only applies to real codes. */
function normalizeBarcode(barcode?: string | null): string | null | undefined {
  if (barcode === undefined) return undefined;
  return barcode?.trim() || null;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productsRepository: Repository<Product>,
    @InjectRepository(ProductImage)
    private readonly imagesRepository: Repository<ProductImage>,
    @InjectRepository(ProductVideo)
    private readonly videosRepository: Repository<ProductVideo>,
    @InjectRepository(ProductVariant)
    private readonly variantsRepository: Repository<ProductVariant>,
    @InjectRepository(InventoryHistory)
    private readonly inventoryHistoryRepository: Repository<InventoryHistory>,
    private readonly storesService: StoresService,
    private readonly categoriesService: CategoriesService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  // ---------------------------------------------------------------------
  // Create / update / archive / duplicate
  // ---------------------------------------------------------------------

  async create(sellerId: string, storeId: string, dto: CreateProductDto): Promise<Product> {
    await this.assertStoreOwnership(storeId, sellerId);
    await this.categoriesService.findById(dto.categoryId);

    const slug = await this.generateUniqueSlug(dto.name);

    return this.dataSource.transaction(async (manager) => {
      const product = manager.create(Product, {
        name: dto.name,
        description: dto.description,
        categoryId: dto.categoryId,
        sku: dto.sku,
        barcode: normalizeBarcode(dto.barcode),
        brand: dto.brand,
        price: dto.price,
        discountPrice: dto.discountPrice,
        stockQuantity: dto.stockQuantity ?? 0,
        lowStockThreshold: dto.lowStockThreshold ?? 5,
        trackInventory: dto.trackInventory ?? true,
        isAvailable: dto.isAvailable ?? true,
        weight: dto.weight,
        deliveryType: dto.deliveryType,
        returnPolicy: dto.returnPolicy,
        tags: dto.tags,
        foodType: dto.foodType,
        preparationTimeMins: dto.preparationTimeMins,
        addonGroups: this.normalizeAddonGroups(dto.addonGroups),
        requiresPrescription: dto.requiresPrescription ?? false,
        composition: dto.composition,
        expiryDate: dto.expiryDate,
        storeId,
        slug,
        images: (dto.images ?? []).map((img) => manager.create(ProductImage, img)),
        videos: (dto.videos ?? []).map((vid) => manager.create(ProductVideo, vid)),
        variants: (dto.variants ?? []).map((v) => manager.create(ProductVariant, v)),
      });

      return manager.save(product);
    }).catch(rethrowBarcodeConflict);
  }

  async update(productId: string, sellerId: string, dto: UpdateProductDto): Promise<Product> {
    const product = await this.findOwnedById(productId, sellerId);

    if (dto.categoryId) {
      await this.categoriesService.findById(dto.categoryId);
    }

    return this.dataSource.transaction(async (manager) => {
      const {
        images,
        videos,
        variants,
        categoryId,
        addonGroups,
        ...rest
      } = dto;

      Object.assign(product, rest);
      if (rest.barcode !== undefined) {
        product.barcode = normalizeBarcode(rest.barcode);
      }
      if (categoryId) {
        product.categoryId = categoryId;
      }
      if (addonGroups !== undefined) {
        product.addonGroups = this.normalizeAddonGroups(addonGroups);
      }

      if (images !== undefined) {
        await manager.delete(ProductImage, { productId: product.id });
        product.images = images.map((img) => manager.create(ProductImage, img));
      }
      if (videos !== undefined) {
        await manager.delete(ProductVideo, { productId: product.id });
        product.videos = videos.map((vid) => manager.create(ProductVideo, vid));
      }
      if (variants !== undefined) {
        await manager.delete(ProductVariant, { productId: product.id });
        product.variants = variants.map((v) => manager.create(ProductVariant, v));
      }

      return manager.save(product);
    }).catch(rethrowBarcodeConflict);
  }

  async archive(productId: string, sellerId: string): Promise<Product> {
    const product = await this.findOwnedById(productId, sellerId);
    product.status = ProductStatus.ARCHIVED;
    return this.productsRepository.save(product);
  }

  // NOTE: MVP decision — sellers archive products instead of hard-deleting
  // them (preserves order/review history referencing the product row), so
  // there is intentionally no `remove()` method here.

  /**
   * Admin moderation archive — bypasses the seller-ownership check that
   * `archive()` enforces, since an admin acting on a policy violation is
   * not necessarily (and usually isn't) the owning seller.
   */
  async adminArchive(productId: string): Promise<void> {
    const product = await this.findById(productId);
    product.status = ProductStatus.ARCHIVED;
    await this.productsRepository.save(product);
  }

  async countByStatus(status: ProductStatus): Promise<number> {
    return this.productsRepository.count({ where: { status } });
  }

  async duplicate(
    productId: string,
    sellerId: string,
    dto: DuplicateProductDto,
  ): Promise<Product> {
    const original = await this.findOwnedById(productId, sellerId);

    const name = dto.newName ?? `${original.name} (Copy)`;
    const slug = await this.generateUniqueSlug(name);

    return this.dataSource.transaction(async (manager) => {
      const clone = manager.create(Product, {
        storeId: original.storeId,
        categoryId: original.categoryId,
        name,
        slug,
        description: original.description,
        sku: original.sku,
        // A barcode belongs to one product; the copy (e.g. a new size) needs its own.
        barcode: null,
        brand: original.brand,
        price: original.price,
        discountPrice: original.discountPrice,
        stockQuantity: 0,
        lowStockThreshold: original.lowStockThreshold,
        trackInventory: original.trackInventory,
        isAvailable: original.isAvailable,
        weight: original.weight,
        deliveryType: original.deliveryType,
        returnPolicy: original.returnPolicy,
        status: ProductStatus.ACTIVE,
        tags: original.tags,
        foodType: original.foodType,
        preparationTimeMins: original.preparationTimeMins,
        // Fresh ids: the copy is a separate product, cart lines must not cross over.
        addonGroups: this.normalizeAddonGroups(
          (original.addonGroups ?? []).map(({ id: _groupId, options, ...group }) => ({
            ...group,
            options: options.map(({ id: _optionId, ...option }) => option),
          })),
        ),
        requiresPrescription: original.requiresPrescription,
        composition: original.composition,
        // Expiry belongs to the stock on hand, which the copy starts without.
        expiryDate: null,
        images: (original.images ?? []).map((img) =>
          manager.create(ProductImage, { url: img.url, sortOrder: img.sortOrder }),
        ),
        videos: (original.videos ?? []).map((vid) =>
          manager.create(ProductVideo, { url: vid.url, sortOrder: vid.sortOrder }),
        ),
        variants: (original.variants ?? []).map((v) =>
          manager.create(ProductVariant, {
            name: v.name,
            sku: v.sku,
            priceDelta: v.priceDelta,
            stockQuantity: 0,
          }),
        ),
      });

      return manager.save(clone);
    });
  }

  // ---------------------------------------------------------------------
  // Lookups
  // ---------------------------------------------------------------------

  async findById(id: string): Promise<Product> {
    const product = await this.productsRepository.findOne({
      where: { id },
      relations: ['images', 'videos', 'variants', 'store', 'category'],
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return product;
  }

  async findBySlug(slug: string): Promise<Product> {
    const product = await this.productsRepository.findOne({
      where: { slug },
      relations: ['images', 'videos', 'variants', 'store', 'category'],
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return product;
  }

  /** Public detail lookup by id or slug — active status + approved store only. */
  async findPublicByIdOrSlug(idOrSlug: string): Promise<Product> {
    const where = UUID_REGEX.test(idOrSlug) ? { id: idOrSlug } : { slug: idOrSlug };
    const product = await this.productsRepository.findOne({
      where: { ...where, status: ProductStatus.ACTIVE },
      // The store's delivery mode decides what the product page offers (see product-delivery.ts).
      relations: ['images', 'videos', 'variants', 'store', 'store.deliverySettings', 'category'],
    });
    if (!product || product.store?.approvalStatus !== StoreApprovalStatus.APPROVED) {
      throw new NotFoundException('Product not found');
    }
    return product;
  }

  /** Seller's own product detail regardless of status, ownership-checked. */
  async findMineById(productId: string, sellerId: string): Promise<Product> {
    return this.findOwnedById(productId, sellerId, [
      'images',
      'videos',
      'variants',
      'store',
      'category',
    ]);
  }

  // ---------------------------------------------------------------------
  // Browse / search
  // ---------------------------------------------------------------------

  /**
   * Public browse/search: active products belonging to approved stores only.
   * Given the shopper's `lat`/`lng`, only stores within `radiusKm` count, the
   * same rule `StoresService.findNearby` lists stores by.
   */
  async findPublic(query: QueryProductsDto): Promise<PaginatedResult<Product>> {
    const qb = this.productsRepository
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.images', 'images')
      .innerJoin('product.store', 'store')
      .addSelect(['store.id', 'store.name', 'store.slug', 'store.approvalStatus'])
      .where('product.status = :status', { status: ProductStatus.ACTIVE })
      .andWhere('store.approvalStatus = :approved', { approved: StoreApprovalStatus.APPROVED });

    if (query.lat !== undefined && query.lng !== undefined) {
      qb.andWhere(`${storeDistanceKmSql()} <= :radiusKm`, {
        lat: query.lat,
        lng: query.lng,
        radiusKm: query.radiusKm,
      });
    }

    this.applyCommonFilters(qb, query);
    this.applySort(qb, query.sortBy);

    return this.paginateQuery(qb, query);
  }

  /** A single store's public product listing (approved products only). */
  async findByStore(storeId: string, query: QueryProductsDto): Promise<PaginatedResult<Product>> {
    return this.findPublic({ ...query, storeId });
  }

  /** Seller's own product listing — all statuses, no store-approval filter. */
  async findMine(
    sellerId: string,
    storeId: string,
    query: QueryProductsDto,
  ): Promise<PaginatedResult<Product>> {
    await this.assertStoreOwnership(storeId, sellerId);

    const qb = this.productsRepository
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.images', 'images')
      .where('product.storeId = :storeId', { storeId });

    if (query.status) {
      qb.andWhere('product.status = :status', { status: query.status });
    }

    this.applyCommonFilters(qb, query, { skipStoreFilter: true });
    this.applySort(qb, query.sortBy);

    return this.paginateQuery(qb, query);
  }

  private applyCommonFilters(
    qb: SelectQueryBuilder<Product>,
    query: QueryProductsDto,
    opts: { skipStoreFilter?: boolean } = {},
  ): void {
    if (query.search) {
      qb.andWhere('product.name ILIKE :search', { search: `%${query.search}%` });
    }
    if (query.categoryId) {
      qb.andWhere('product.categoryId = :categoryId', { categoryId: query.categoryId });
    }
    if (!opts.skipStoreFilter && query.storeId) {
      qb.andWhere('product.storeId = :storeId', { storeId: query.storeId });
    }
    if (query.brand) {
      qb.andWhere('product.brand ILIKE :brand', { brand: `%${query.brand}%` });
    }
    if (query.foodType) {
      qb.andWhere('product.foodType = :foodType', { foodType: query.foodType });
    }
    if (query.minPrice !== undefined) {
      qb.andWhere('product.price >= :minPrice', { minPrice: query.minPrice });
    }
    if (query.maxPrice !== undefined) {
      qb.andWhere('product.price <= :maxPrice', { maxPrice: query.maxPrice });
    }
  }

  private applySort(qb: SelectQueryBuilder<Product>, sortBy?: ProductSortBy): void {
    switch (sortBy) {
      case ProductSortBy.PRICE_ASC:
        qb.orderBy('product.price', 'ASC');
        break;
      case ProductSortBy.PRICE_DESC:
        qb.orderBy('product.price', 'DESC');
        break;
      case ProductSortBy.RATING:
        qb.orderBy('product.avgRating', 'DESC');
        break;
      case ProductSortBy.NEWEST:
      default:
        qb.orderBy('product.createdAt', 'DESC');
        break;
    }
  }

  private async paginateQuery(
    qb: SelectQueryBuilder<Product>,
    query: QueryProductsDto,
  ): Promise<PaginatedResult<Product>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const total = await qb.getCount();
    const data = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    return paginate(data, total, page, limit);
  }

  // ---------------------------------------------------------------------
  // Inventory
  // ---------------------------------------------------------------------

  /**
   * Atomically adjusts stock on the product or a specific variant via a
   * DB-level increment (avoids read-then-write races on the counter
   * itself), guarded so the result can never go negative. Also writes an
   * `InventoryHistory` row; `previousQty`/`newQty` are derived from the
   * atomically-returned new value (`previousQty = newQty - delta`), so the
   * history snapshot is exact, not merely "probably right".
   */
  async adjustStock(
    productId: string,
    variantId: string | undefined,
    delta: number,
    reason: string,
  ): Promise<void> {
    if (delta === 0) {
      throw new BadRequestException('changeQty must not be zero');
    }

    if (variantId) {
      const variant = await this.variantsRepository.findOne({ where: { id: variantId, productId } });
      if (!variant) {
        throw new NotFoundException('Variant not found for this product');
      }

      const result = await this.variantsRepository
        .createQueryBuilder()
        .update(ProductVariant)
        .set({ stockQuantity: () => `"stockQuantity" + (${delta})` })
        .where('id = :id AND "stockQuantity" + (:delta) >= 0', { id: variantId, delta })
        .returning('"stockQuantity"')
        .execute();

      if (result.affected === 0) {
        throw new BadRequestException('Insufficient stock for this variant');
      }

      const newQty = result.raw[0].stockQuantity as number;
      await this.inventoryHistoryRepository.save(
        this.inventoryHistoryRepository.create({
          productId,
          variantId,
          changeQty: delta,
          reason,
          previousQty: newQty - delta,
          newQty,
        }),
      );
      return;
    }

    const result = await this.productsRepository
      .createQueryBuilder()
      .update(Product)
      .set({ stockQuantity: () => `"stockQuantity" + (${delta})` })
      .where('id = :id AND "stockQuantity" + (:delta) >= 0', { id: productId, delta })
      .returning('"stockQuantity"')
      .execute();

    if (result.affected === 0) {
      const exists = await this.productsRepository.findOne({ where: { id: productId } });
      if (!exists) {
        throw new NotFoundException('Product not found');
      }
      throw new BadRequestException('Insufficient stock for this product');
    }

    const newQty = result.raw[0].stockQuantity as number;
    await this.inventoryHistoryRepository.save(
      this.inventoryHistoryRepository.create({
        productId,
        variantId: null,
        changeQty: delta,
        reason,
        previousQty: newQty - delta,
        newQty,
      }),
    );
  }

  /** Ownership-checked wrapper around adjustStock for manual seller corrections. */
  async manualAdjustStock(
    productId: string,
    sellerId: string,
    dto: AdjustStockDto,
  ): Promise<void> {
    await this.findOwnedById(productId, sellerId);
    const reason = dto.reason.startsWith('manual_') ? dto.reason : `manual_${dto.reason}`;
    await this.adjustStock(productId, dto.variantId, dto.changeQty, reason);
  }

  /** Bare id list for a store's products — used by the Reviews module to fold
   * product-level reviews into a store's combined seller-facing feed. */
  async findIdsByStore(storeId: string): Promise<string[]> {
    const rows = await this.productsRepository.find({ where: { storeId }, select: ['id'] });
    return rows.map((row) => row.id);
  }

  async findLowStock(storeId: string, sellerId: string): Promise<Product[]> {
    await this.assertStoreOwnership(storeId, sellerId);

    const products = await this.productsRepository.find({
      where: { storeId, trackInventory: true },
      relations: ['variants'],
    });

    return products.filter(
      (product) =>
        product.stockQuantity <= product.lowStockThreshold ||
        (product.variants ?? []).some((v) => v.stockQuantity <= product.lowStockThreshold),
    );
  }

  async getInventoryHistory(
    productId: string,
    sellerId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedResult<InventoryHistory>> {
    await this.findOwnedById(productId, sellerId);

    const [data, total] = await this.inventoryHistoryRepository.findAndCount({
      where: { productId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return paginate(data, total, page, limit);
  }

  /**
   * Setter the future Reviews module calls after computing new rating
   * aggregates — no rating computation logic lives here on purpose.
   */
  async updateRatingStats(productId: string, avgRating: number, reviewCount: number): Promise<void> {
    await this.productsRepository.update({ id: productId }, { avgRating, reviewCount });
  }

  // ---------------------------------------------------------------------
  // Ownership / helpers
  // ---------------------------------------------------------------------

  private async assertStoreOwnership(storeId: string, sellerId: string): Promise<void> {
    const store = await this.storesService.findById(storeId);
    if (store.sellerId !== sellerId) {
      throw new ForbiddenException('You do not have access to this store');
    }
  }

  private async findOwnedById(
    productId: string,
    sellerId: string,
    relations: string[] = [],
  ): Promise<Product> {
    const product = await this.productsRepository.findOne({
      where: { id: productId },
      relations: [...new Set(['store', ...relations])],
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    if (product.store.sellerId !== sellerId) {
      throw new ForbiddenException('You do not have access to this product');
    }
    return product;
  }

  /**
   * Validates add-on groups and assigns ids to new groups/options. Ids the
   * client sends back are kept, so customers' cart lines referencing an
   * option survive the seller editing the menu.
   */
  private normalizeAddonGroups(groups?: ProductAddonGroupDto[] | null): ProductAddonGroup[] {
    const normalized = (groups ?? []).map((group) => {
      const name = group.name.trim();
      const minSelect = group.minSelect ?? 0;
      const maxSelect = group.maxSelect ?? group.options.length;
      if (maxSelect < minSelect) {
        throw new BadRequestException(`Add-on group "${name}": max choices can't be below min choices`);
      }
      if (minSelect > group.options.length) {
        throw new BadRequestException(`Add-on group "${name}" requires more choices than it has options`);
      }
      return {
        id: group.id ?? uuidv4(),
        name,
        minSelect,
        maxSelect: Math.min(maxSelect, group.options.length),
        options: group.options.map((option) => ({
          id: option.id ?? uuidv4(),
          name: option.name.trim(),
          price: round2(option.price ?? 0),
          isAvailable: option.isAvailable ?? true,
        })),
      };
    });

    const ids = normalized.flatMap((group) => [group.id, ...group.options.map((option) => option.id)]);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('Add-on group and option ids must be unique');
    }
    return normalized;
  }

  private async generateUniqueSlug(name: string): Promise<string> {
    const base = slugify(name, { lower: true, strict: true });
    let slug = base;
    let attempts = 0;

    while (await this.productsRepository.findOne({ where: { slug } })) {
      attempts += 1;
      slug = `${base}-${nanoid(6)}`;
      if (attempts > 5) {
        break;
      }
    }

    return slug;
  }
}

/** Turns the per-store barcode unique index violation into a readable 409. */
function rethrowBarcodeConflict(err: unknown): never {
  const driverError = (err as QueryFailedError & { driverError?: { code?: string; constraint?: string } })
    .driverError;
  if (
    err instanceof QueryFailedError &&
    driverError?.code === '23505' &&
    driverError.constraint === STORE_BARCODE_UNIQUE
  ) {
    throw new ConflictException('You already sell an active product with this barcode in this store');
  }
  throw err;
}
