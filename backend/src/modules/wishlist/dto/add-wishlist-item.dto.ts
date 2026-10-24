import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsUUID } from 'class-validator';
import { WishlistTargetType } from '../entities/wishlist-item.entity';

export class AddWishlistItemDto {
  @ApiProperty({ enum: WishlistTargetType, example: WishlistTargetType.PRODUCT })
  @IsEnum(WishlistTargetType)
  targetType: WishlistTargetType;

  @ApiProperty({ example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479' })
  @IsUUID()
  targetId: string;
}
