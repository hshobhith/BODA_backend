import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { WishlistService } from './wishlist.service';
import { WishlistTargetType } from './entities/wishlist-item.entity';
import { AddWishlistItemDto } from './dto/add-wishlist-item.dto';
import { QueryWishlistDto } from './dto/query-wishlist.dto';

@ApiTags('wishlist')
@ApiBearerAuth()
@Controller('wishlist')
export class WishlistController {
  constructor(private readonly wishlistService: WishlistService) {}

  @Get()
  @ApiOperation({ summary: "Current user's wishlist (paginated, optionally filtered by targetType)" })
  @ApiQuery({ name: 'targetType', enum: WishlistTargetType, required: false })
  @ApiResponse({ status: 200, description: 'Paginated wishlist with hydrated target summaries' })
  async findMine(@CurrentUser() user: CurrentUserPayload, @Query() query: QueryWishlistDto) {
    return this.wishlistService.findMine(
      user.id,
      query.targetType,
      query.page ?? 1,
      query.limit ?? 20,
    );
  }

  @Post()
  @ApiOperation({ summary: 'Add a product or store to the wishlist (idempotent)' })
  @ApiResponse({ status: 201, description: 'Wishlist item created or already existed' })
  @ApiResponse({ status: 404, description: 'Target product/store not found' })
  async add(@CurrentUser() user: CurrentUserPayload, @Body() dto: AddWishlistItemDto) {
    return this.wishlistService.add(user.id, dto);
  }

  @Delete(':targetType/:targetId')
  @ApiOperation({ summary: 'Remove a product or store from the wishlist' })
  @ApiParam({ name: 'targetType', enum: WishlistTargetType })
  @ApiResponse({ status: 200, description: 'Wishlist item removed (no-op if absent)' })
  async remove(
    @CurrentUser() user: CurrentUserPayload,
    @Param('targetType') targetType: WishlistTargetType,
    @Param('targetId') targetId: string,
  ) {
    await this.wishlistService.remove(user.id, targetType, targetId);
    return { success: true };
  }

  @Get('check/:targetType/:targetId')
  @ApiOperation({ summary: 'Check whether a product or store is already wishlisted' })
  @ApiParam({ name: 'targetType', enum: WishlistTargetType })
  @ApiResponse({ status: 200, description: 'Wishlist status' })
  async check(
    @CurrentUser() user: CurrentUserPayload,
    @Param('targetType') targetType: WishlistTargetType,
    @Param('targetId') targetId: string,
  ) {
    const wishlisted = await this.wishlistService.isWishlisted(user.id, targetType, targetId);
    return { wishlisted };
  }
}
