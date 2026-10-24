import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { WishlistTargetType } from '../entities/wishlist-item.entity';

export class QueryWishlistDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: WishlistTargetType })
  @IsOptional()
  @IsEnum(WishlistTargetType)
  targetType?: WishlistTargetType;
}
