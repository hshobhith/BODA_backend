import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class ProductVariantDto {
  @ApiProperty({ example: 'Size: L' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'SKU-L-001' })
  @IsOptional()
  @IsString()
  sku?: string;

  @ApiPropertyOptional({ example: 0, default: 0, description: 'Amount added to base price for this variant' })
  @IsOptional()
  @IsNumber()
  priceDelta?: number;

  @ApiProperty({ example: 10 })
  @IsInt()
  @Min(0)
  stockQuantity: number;
}
