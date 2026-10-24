import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { PaginatedResult, paginate } from '../../common/utils/paginate.util';
import { ProductsService } from '../products/products.service';
import { StoresService } from '../stores/stores.service';
import { WishlistItem, WishlistTargetType } from './entities/wishlist-item.entity';
import { AddWishlistItemDto } from './dto/add-wishlist-item.dto';

export interface WishlistProductSummary {
  id: string;
  name: string;
  slug: string;
  price: number;
  discountPrice?: number | null;
  imageUrl?: string | null;
  avgRating: number;
  storeSlug: string;
}

export interface WishlistStoreSummary {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string | null;
  avgRating: number;
}

export interface WishlistItemWithTarget extends WishlistItem {
  target?: WishlistProductSummary | WishlistStoreSummary | null;
}

@Injectable()
export class WishlistService {
  constructor(
    @InjectRepository(WishlistItem)
    private readonly wishlistRepository: Repository<WishlistItem>,
    private readonly productsService: ProductsService,
    private readonly storesService: StoresService,
  ) {}

  // ---------------------------------------------------------------------
  // Add / remove / check
  // ---------------------------------------------------------------------

  /**
   * Idempotent add: this backs a "toggle heart icon" UX, so re-adding an
   * already-wishlisted item just returns the existing row rather than
   * throwing a conflict.
   */
  async add(userId: string, dto: AddWishlistItemDto): Promise<WishlistItem> {
    await this.assertTargetExists(dto.targetType, dto.targetId);

    const existing = await this.wishlistRepository.findOne({
      where: { userId, targetType: dto.targetType, targetId: dto.targetId },
    });
    if (existing) {
      return existing;
    }

    const item = this.wishlistRepository.create({
      userId,
      targetType: dto.targetType,
      targetId: dto.targetId,
    });
    return this.wishlistRepository.save(item);
  }

  async remove(userId: string, targetType: WishlistTargetType, targetId: string): Promise<void> {
    await this.wishlistRepository.softDelete({ userId, targetType, targetId, deletedAt: IsNull() });
  }

  async isWishlisted(
    userId: string,
    targetType: WishlistTargetType,
    targetId: string,
  ): Promise<boolean> {
    const count = await this.wishlistRepository.count({
      where: { userId, targetType, targetId },
    });
    return count > 0;
  }

  // ---------------------------------------------------------------------
  // Lookups
  // ---------------------------------------------------------------------

  async findMine(
    userId: string,
    targetType: WishlistTargetType | undefined,
    page: number,
    limit: number,
  ): Promise<PaginatedResult<WishlistItemWithTarget>> {
    const where = targetType ? { userId, targetType } : { userId };

    const [items, total] = await this.wishlistRepository.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const hydrated = await this.hydrateTargets(items);

    return paginate(hydrated, total, page, limit);
  }

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------

  private async assertTargetExists(targetType: WishlistTargetType, targetId: string): Promise<void> {
    if (targetType === WishlistTargetType.PRODUCT) {
      try {
        await this.productsService.findById(targetId);
      } catch {
        throw new NotFoundException('Product not found');
      }
    } else {
      try {
        await this.storesService.findById(targetId);
      } catch {
        throw new NotFoundException('Store not found');
      }
    }
  }

  /**
   * Batched follow-up lookup by id through the owning module's service —
   * avoids needing a new cross-module relation for a handful of summary
   * fields. Stale entries (target deleted after being wishlisted) are
   * dropped silently rather than surfacing an error on an otherwise
   * healthy list.
   */
  private async hydrateTargets(items: WishlistItem[]): Promise<WishlistItemWithTarget[]> {
    return Promise.all(
      items.map(async (item): Promise<WishlistItemWithTarget> => {
        try {
          if (item.targetType === WishlistTargetType.PRODUCT) {
            const product = await this.productsService.findById(item.targetId);
            const target: WishlistProductSummary = {
              id: product.id,
              name: product.name,
              slug: product.slug,
              price: product.price,
              discountPrice: product.discountPrice,
              imageUrl: product.images?.[0]?.url ?? null,
              avgRating: product.avgRating,
              storeSlug: product.store.slug,
            };
            return { ...item, target };
          }

          const store = await this.storesService.findById(item.targetId);
          const target: WishlistStoreSummary = {
            id: store.id,
            name: store.name,
            slug: store.slug,
            logoUrl: store.logoUrl,
            avgRating: store.avgRating,
          };
          return { ...item, target };
        } catch {
          return { ...item, target: null };
        }
      }),
    );
  }
}
