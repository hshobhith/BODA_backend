import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsInt, IsOptional, IsUUID, Min } from 'class-validator';

export class AddToCartDto {
  @ApiProperty({ description: 'Product to add to the cart' })
  @IsUUID()
  productId: string;

  @ApiPropertyOptional({ description: 'Specific variant of the product, if any' })
  @IsOptional()
  @IsUUID()
  variantId?: string;

  @ApiPropertyOptional({ type: [String], description: 'Chosen add-on option ids (restaurant items)' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  addonOptionIds?: string[];

  @ApiProperty({ example: 1, minimum: 1 })
  @IsInt()
  @Min(1)
  quantity: number;
}
