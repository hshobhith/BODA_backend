import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { PaginatedResult, paginate } from '../../common/utils/paginate.util';
import { ProductsService } from '../products/products.service';
import { StoresService } from '../stores/stores.service';
import { Review, ReviewTargetType } from './entities/review.entity';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';

@Injectable()
export class ReviewsService {
  constructor(
    @InjectRepository(Review)
    private readonly reviewsRepository: Repository<Review>,
    private readonly productsService: ProductsService,
    private readonly storesService: StoresService,
  ) {}

  // ---------------------------------------------------------------------
  // Create / update / remove
  // ---------------------------------------------------------------------

  async create(userId: string, dto: CreateReviewDto): Promise<Review> {
    if (dto.targetType === ReviewTargetType.STORE) {
      throw new BadRequestException(
        'Reviews are left on products, not stores. A store\'s rating is the average of its product reviews.',
      );
    }

    await this.assertTargetExists(dto.targetType, dto.targetId);

    const existing = await this.reviewsRepository.findOne({
      where: { userId, targetType: dto.targetType, targetId: dto.targetId },
    });
    if (existing) {
      throw new ConflictException(
        'You have already reviewed this item. Update your existing review instead.',
      );
    }

    const review = this.reviewsRepository.create({
      userId,
      targetType: dto.targetType,
      targetId: dto.targetId,
      rating: dto.rating,
      comment: dto.comment,
      images: dto.images,
    });
    const saved = await this.reviewsRepository.save(review);

    await this.recomputeTargetRatingStats(dto.targetType, dto.targetId);
    await this.cascadeToOwningStore(dto.targetType, dto.targetId);

    return saved;
  }

  async update(userId: string, reviewId: string, dto: UpdateReviewDto): Promise<Review> {
    const review = await this.findOwnedById(reviewId, userId);

    Object.assign(review, dto);
    const saved = await this.reviewsRepository.save(review);

    await this.recomputeTargetRatingStats(review.targetType, review.targetId);
    await this.cascadeToOwningStore(review.targetType, review.targetId);

    return saved;
  }

  async remove(userId: string, reviewId: string, isAdmin: boolean): Promise<void> {
    const review = await this.reviewsRepository.findOne({ where: { id: reviewId } });
    if (!review) {
      throw new NotFoundException('Review not found');
    }
    if (review.userId !== userId && !isAdmin) {
      throw new ForbiddenException('You do not have access to this review');
    }

    await this.reviewsRepository.softRemove(review);

    await this.recomputeTargetRatingStats(review.targetType, review.targetId);
    await this.cascadeToOwningStore(review.targetType, review.targetId);
  }

  /** Hides every review a deleted user wrote and re-rates what they reviewed. */
  async removeAllByUser(userId: string): Promise<void> {
    const reviews = await this.reviewsRepository.find({ where: { userId } });
    if (reviews.length === 0) {
      return;
    }

    await this.reviewsRepository.softRemove(reviews);

    for (const review of reviews) {
      await this.recomputeTargetRatingStats(review.targetType, review.targetId);
      await this.cascadeToOwningStore(review.targetType, review.targetId);
    }
  }

  // ---------------------------------------------------------------------
  // Seller replies
  // ---------------------------------------------------------------------

  async reply(sellerId: string, reviewId: string, replyText: string): Promise<Review> {
    const review = await this.findById(reviewId);
    await this.assertSellerOwnsReviewTarget(review, sellerId);

    review.sellerReply = replyText;
    review.sellerRepliedAt = new Date();
    return this.reviewsRepository.save(review);
  }

  async removeReply(sellerId: string, reviewId: string): Promise<Review> {
    const review = await this.findById(reviewId);
    await this.assertSellerOwnsReviewTarget(review, sellerId);

    review.sellerReply = null;
    review.sellerRepliedAt = null;
    return this.reviewsRepository.save(review);
  }

  /**
   * Reviews for everything under one of the seller's stores — the store's
   * own reviews plus every review left on that store's products, merged
   * into one feed since a seller manages both from the same place.
   */
  async findForSeller(
    sellerId: string,
    storeId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedResult<Review>> {
    const store = await this.storesService.findMineById(storeId, sellerId);
    const productIds = await this.productsService.findIdsByStore(store.id);

    const qb = this.reviewsRepository
      .createQueryBuilder('review')
      .innerJoin('review.user', 'user')
      .addSelect(['user.id', 'user.fullName', 'user.avatarUrl'])
      .where(
        new Brackets((sub) => {
          sub.where('review.targetType = :storeType AND review.targetId = :storeId', {
            storeType: ReviewTargetType.STORE,
            storeId: store.id,
          });
          if (productIds.length > 0) {
            sub.orWhere('review.targetType = :productType AND review.targetId IN (:...productIds)', {
              productType: ReviewTargetType.PRODUCT,
              productIds,
            });
          }
        }),
      )
      .orderBy('review.createdAt', 'DESC');

    const total = await qb.getCount();
    const data = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    return paginate(data, total, page, limit);
  }

  private async assertSellerOwnsReviewTarget(review: Review, sellerId: string): Promise<void> {
    const storeId =
      review.targetType === ReviewTargetType.STORE
        ? review.targetId
        : (await this.productsService.findById(review.targetId)).storeId;

    const store = await this.storesService.findById(storeId);
    if (store.sellerId !== sellerId) {
      throw new ForbiddenException('You do not have access to this review');
    }
  }

  // ---------------------------------------------------------------------
  // Lookups
  // ---------------------------------------------------------------------

  async findById(reviewId: string): Promise<Review> {
    const review = await this.reviewsRepository.findOne({ where: { id: reviewId } });
    if (!review) {
      throw new NotFoundException('Review not found');
    }
    return review;
  }

  async findForTarget(
    targetType: ReviewTargetType,
    targetId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedResult<Review>> {
    const qb = this.reviewsRepository
      .createQueryBuilder('review')
      .innerJoin('review.user', 'user')
      .addSelect(['user.id', 'user.fullName', 'user.avatarUrl'])
      .where('review.targetType = :targetType', { targetType })
      .andWhere('review.targetId = :targetId', { targetId })
      .orderBy('review.createdAt', 'DESC');

    const total = await qb.getCount();
    const data = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    return paginate(data, total, page, limit);
  }

  async findMine(userId: string, page: number, limit: number): Promise<PaginatedResult<Review>> {
    const [data, total] = await this.reviewsRepository.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return paginate(data, total, page, limit);
  }

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------

  private async assertTargetExists(targetType: ReviewTargetType, targetId: string): Promise<void> {
    if (targetType === ReviewTargetType.PRODUCT) {
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

  private async findOwnedById(reviewId: string, userId: string): Promise<Review> {
    const review = await this.reviewsRepository.findOne({ where: { id: reviewId } });
    if (!review) {
      throw new NotFoundException('Review not found');
    }
    if (review.userId !== userId) {
      throw new ForbiddenException('You do not have access to this review');
    }
    return review;
  }

  /**
   * Recomputes AVG(rating)/COUNT(*) for a target from the reviews table and
   * persists the aggregate onto the target's own row via the owning
   * module's service — no rating math lives on Product/Store themselves.
   */
  private async recomputeTargetRatingStats(
    targetType: ReviewTargetType,
    targetId: string,
  ): Promise<void> {
    const raw = await this.reviewsRepository
      .createQueryBuilder('review')
      .select('COALESCE(AVG(review.rating), 0)', 'avg')
      .addSelect('COUNT(*)', 'count')
      .where('review.targetType = :targetType', { targetType })
      .andWhere('review.targetId = :targetId', { targetId })
      .getRawOne<{ avg: string; count: string }>();

    const avgRating = Math.round(parseFloat(raw?.avg ?? '0') * 100) / 100;
    const reviewCount = parseInt(raw?.count ?? '0', 10);

    if (targetType === ReviewTargetType.PRODUCT) {
      await this.productsService.updateRatingStats(targetId, avgRating, reviewCount);
    } else {
      await this.storesService.updateRatingStats(targetId, avgRating, reviewCount);
    }
  }

  /**
   * Stores aren't reviewed directly — a store's rating is the rollup average
   * of all reviews left on its products. Whenever a product review changes,
   * recompute its owning store's aggregate too.
   */
  private async cascadeToOwningStore(targetType: ReviewTargetType, targetId: string): Promise<void> {
    if (targetType !== ReviewTargetType.PRODUCT) {
      return;
    }
    const product = await this.productsService.findById(targetId);
    await this.recomputeStoreRatingFromProducts(product.storeId);
  }

  private async recomputeStoreRatingFromProducts(storeId: string): Promise<void> {
    const productIds = await this.productsService.findIdsByStore(storeId);
    if (productIds.length === 0) {
      await this.storesService.updateRatingStats(storeId, 0, 0);
      return;
    }

    const raw = await this.reviewsRepository
      .createQueryBuilder('review')
      .select('COALESCE(AVG(review.rating), 0)', 'avg')
      .addSelect('COUNT(*)', 'count')
      .where('review.targetType = :targetType', { targetType: ReviewTargetType.PRODUCT })
      .andWhere('review.targetId IN (:...productIds)', { productIds })
      .getRawOne<{ avg: string; count: string }>();

    const avgRating = Math.round(parseFloat(raw?.avg ?? '0') * 100) / 100;
    const reviewCount = parseInt(raw?.count ?? '0', 10);

    await this.storesService.updateRatingStats(storeId, avgRating, reviewCount);
  }
}
