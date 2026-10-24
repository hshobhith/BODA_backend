import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { Role } from '../../common/enums/role.enum';
import { ReviewsService } from './reviews.service';
import { ReviewTargetType } from './entities/review.entity';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import { ReplyReviewDto } from './dto/reply-review.dto';

@ApiTags('reviews')
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Public()
  @Get('target/:targetType/:targetId')
  @ApiOperation({ summary: 'List reviews for a product or store (public, paginated)' })
  @ApiParam({ name: 'targetType', enum: ReviewTargetType })
  @ApiResponse({ status: 200, description: 'Paginated list of reviews' })
  async findForTarget(
    @Param('targetType') targetType: ReviewTargetType,
    @Param('targetId') targetId: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.reviewsService.findForTarget(
      targetType,
      targetId,
      query.page ?? 1,
      query.limit ?? 20,
    );
  }

  @ApiBearerAuth()
  @Get('mine')
  @ApiOperation({ summary: "Current user's own reviews (paginated)" })
  @ApiResponse({ status: 200, description: 'Paginated list of the current user reviews' })
  async findMine(@CurrentUser() user: CurrentUserPayload, @Query() query: PaginationQueryDto) {
    return this.reviewsService.findMine(user.id, query.page ?? 1, query.limit ?? 20);
  }

  @ApiBearerAuth()
  @Post()
  @ApiOperation({ summary: 'Create a review for a product or store' })
  @ApiResponse({ status: 201, description: 'Review created' })
  @ApiResponse({ status: 404, description: 'Target product/store not found' })
  @ApiResponse({ status: 409, description: 'Already reviewed this target' })
  async create(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateReviewDto) {
    return this.reviewsService.create(user.id, dto);
  }

  @ApiBearerAuth()
  @Patch(':id')
  @ApiOperation({ summary: 'Update your own review' })
  @ApiResponse({ status: 200, description: 'Review updated' })
  @ApiResponse({ status: 403, description: 'Not the review owner' })
  async update(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: UpdateReviewDto,
  ) {
    return this.reviewsService.update(user.id, id, dto);
  }

  @ApiBearerAuth()
  @Delete(':id')
  @ApiOperation({ summary: 'Delete a review (owner or admin)' })
  @ApiResponse({ status: 200, description: 'Review deleted' })
  @ApiResponse({ status: 403, description: 'Not the review owner or an admin' })
  async remove(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    await this.reviewsService.remove(user.id, id, user.role === Role.ADMIN);
    return { success: true };
  }

  // -----------------------------------------------------------------
  // Seller replies
  // -----------------------------------------------------------------

  @Roles(Role.SELLER)
  @ApiBearerAuth()
  @Get('store/:storeId/mine')
  @ApiOperation({
    summary: "Reviews for one of the seller's stores, including reviews on that store's products",
  })
  @ApiResponse({ status: 200, description: 'Paginated list of reviews' })
  @ApiResponse({ status: 403, description: 'Not the store owner' })
  async findForSeller(
    @CurrentUser() user: CurrentUserPayload,
    @Param('storeId') storeId: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.reviewsService.findForSeller(user.id, storeId, query.page ?? 1, query.limit ?? 20);
  }

  @Roles(Role.SELLER)
  @ApiBearerAuth()
  @Patch(':id/reply')
  @ApiOperation({ summary: 'Reply to a review left on your store or one of its products' })
  @ApiResponse({ status: 200, description: 'Reply saved' })
  @ApiResponse({ status: 403, description: 'Not the owning seller' })
  @ApiResponse({ status: 404, description: 'Review not found' })
  async reply(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: ReplyReviewDto,
  ) {
    return this.reviewsService.reply(user.id, id, dto.reply);
  }

  @Roles(Role.SELLER)
  @ApiBearerAuth()
  @Delete(':id/reply')
  @ApiOperation({ summary: 'Remove your reply from a review' })
  @ApiResponse({ status: 200, description: 'Reply removed' })
  @ApiResponse({ status: 403, description: 'Not the owning seller' })
  @ApiResponse({ status: 404, description: 'Review not found' })
  async removeReply(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.reviewsService.removeReply(user.id, id);
  }
}
